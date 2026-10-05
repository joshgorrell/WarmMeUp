-- All ways to establish a pair, including concurrent and legacy RPC calls.
CREATE OR REPLACE FUNCTION public.guard_onboarding_pairing()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE member_id uuid;
BEGIN
  IF NOT NEW.active OR NEW.user_b_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.active AND OLD.user_a_id IS NOT DISTINCT FROM NEW.user_a_id
      AND OLD.user_b_id IS NOT DISTINCT FROM NEW.user_b_id THEN RETURN NEW; END IF;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('wmu-pairing', 0));
  IF NEW.user_a_id = NEW.user_b_id THEN RAISE EXCEPTION 'self_pairing'; END IF;
  FOR member_id IN SELECT unnest(ARRAY[NEW.user_a_id, NEW.user_b_id]) LOOP
    IF EXISTS (SELECT 1 FROM public.couples c WHERE c.id <> NEW.id AND c.active
      AND c.user_b_id IS NOT NULL AND member_id IN (c.user_a_id, c.user_b_id)) THEN
      RAISE EXCEPTION 'already_connected' USING ERRCODE = '23505';
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p JOIN auth.users u ON u.id=p.id
    WHERE p.id=NEW.user_b_id AND u.email_confirmed_at IS NOT NULL
    AND nullif(trim(p.first_name),'') IS NOT NULL AND nullif(trim(p.last_name),'') IS NOT NULL
    AND p.date_of_birth <= (current_date - interval '18 years')::date
    AND p.age_verified_at IS NOT NULL AND p.tos_accepted_at IS NOT NULL) THEN
    RAISE EXCEPTION 'registration_incomplete';
  END IF;
  IF EXISTS (SELECT 1 FROM public.content_burn_jobs j WHERE j.couple_id=NEW.id AND j.state='pending') THEN
    RAISE EXCEPTION 'content_cleanup_pending';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_onboarding_pairing() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER guard_onboarding_pairing BEFORE INSERT OR UPDATE OF active,user_a_id,user_b_id
ON public.couples FOR EACH ROW EXECUTE FUNCTION public.guard_onboarding_pairing();

CREATE OR REPLACE FUNCTION public.guard_registration_fields()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF (TG_OP='INSERT' OR NEW.date_of_birth IS DISTINCT FROM OLD.date_of_birth
    OR NEW.age_verified_at IS DISTINCT FROM OLD.age_verified_at
    OR NEW.onboarding_completed_at IS DISTINCT FROM OLD.onboarding_completed_at)
    AND NEW.age_verified_at IS NOT NULL AND (NEW.date_of_birth IS NULL
    OR NEW.date_of_birth > (current_date - interval '18 years')::date) THEN
    RAISE EXCEPTION 'You must be 18 or older to use Warm Me Up';
  END IF;
  IF TG_OP='UPDATE' AND OLD.onboarding_completed_at IS NOT DISTINCT FROM NEW.onboarding_completed_at THEN RETURN NEW; END IF;
  IF NEW.onboarding_completed_at IS NOT NULL AND (nullif(trim(NEW.first_name),'') IS NULL
    OR nullif(trim(NEW.last_name),'') IS NULL OR NEW.date_of_birth IS NULL
    OR NEW.age_verified_at IS NULL OR NEW.tos_accepted_at IS NULL) THEN
    RAISE EXCEPTION 'registration_incomplete';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_registration_fields() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER guard_registration_fields BEFORE INSERT OR UPDATE OF first_name,last_name,date_of_birth,age_verified_at,tos_accepted_at,onboarding_completed_at
ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.guard_registration_fields();

CREATE OR REPLACE FUNCTION public.request_join(invite_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id        uuid;
  v_couple_id      uuid;
  v_user_a_id      uuid;
  v_attempts       int;
  v_window         timestamptz;
  v_sub_owner_id   uuid;
  v_sub_a          uuid;
  v_sub_b          uuid;
  v_inviter_name   text;
  v_inviter_avatar text;
  v_inviter_first  text;
  v_inviter_last   text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'P0001';
  END IF;

  -- Already connected to a partner?
  IF EXISTS (
    SELECT 1 FROM public.couples
    WHERE (user_a_id = v_user_id OR user_b_id = v_user_id)
      AND user_b_id IS NOT NULL
      AND active = true
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_connected');
  END IF;

  -- Rate limit: 10 attempts per 10 minutes (reset on success).
  SELECT attempt_count, window_start
  INTO v_attempts, v_window
  FROM public.invite_join_attempts
  WHERE user_id = v_user_id
  FOR UPDATE;

  IF v_attempts IS NULL THEN
    INSERT INTO public.invite_join_attempts (user_id, attempt_count, window_start)
    VALUES (v_user_id, 1, now());
  ELSIF now() - v_window > interval '10 minutes' THEN
    UPDATE public.invite_join_attempts
    SET attempt_count = 1, window_start = now()
    WHERE user_id = v_user_id;
  ELSE
    UPDATE public.invite_join_attempts
    SET attempt_count = attempt_count + 1
    WHERE user_id = v_user_id;
    IF v_attempts + 1 > 10 THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'rate_limited');
    END IF;
  END IF;

  -- Auto-clear stale pending requests (>30 min old) from other users.
  UPDATE public.couples
  SET pending_partner_id     = NULL,
      pending_partner_status  = NULL,
      pending_requested_at    = NULL
  WHERE user_b_id IS NULL
    AND pending_partner_id IS NOT NULL
    AND pending_partner_id <> v_user_id
    AND pending_requested_at IS NOT NULL
    AND pending_requested_at < now() - interval '30 minutes';

  -- Find the couple with this invite code.
  SELECT id, user_a_id
  INTO v_couple_id, v_user_a_id
  FROM public.couples
  WHERE couples.invite_code = request_join.invite_code
    AND user_b_id IS NULL AND active=true
  LIMIT 1 FOR UPDATE;

  IF v_couple_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  IF v_user_a_id = v_user_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'self');
  END IF;

  -- Clean up caller's prior pending requests.
  UPDATE public.couples
  SET pending_partner_id     = NULL,
      pending_partner_status  = NULL,
      pending_requested_at    = NULL
  WHERE pending_partner_id = v_user_id
    AND user_b_id IS NULL;

  -- Finalize the connection immediately.
  UPDATE public.couples
  SET user_b_id              = v_user_id,
      active                 = true,
      invite_code_used_at    = now(),
      invite_code            = NULL,
      pending_partner_status = 'accepted',
      pending_partner_id     = NULL,
      pending_requested_at   = NULL
  WHERE id = v_couple_id
    AND user_b_id IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  UPDATE public.user_settings SET celebration_seen=false WHERE user_id IN (v_user_id,v_user_a_id);

  -- Reset rate limit on success.
  UPDATE public.invite_join_attempts
  SET attempt_count = 0, window_start = now()
  WHERE user_id = v_user_id;

  -- Delete User B's auto-generated trial subscription (never paid plans).
  DELETE FROM public.subscriptions
  WHERE user_id = v_user_id
    AND plan = 'trial';

  -- Recalculate subscription_owner_id after the accidental trial is removed.
  SELECT id INTO v_sub_a FROM public.subscriptions
  WHERE user_id = v_user_a_id AND status = 'active' LIMIT 1;
  SELECT id INTO v_sub_b FROM public.subscriptions
  WHERE user_id = v_user_id AND status = 'active' LIMIT 1;

  v_sub_owner_id := COALESCE(
    CASE WHEN v_sub_a IS NOT NULL THEN v_user_a_id END,
    CASE WHEN v_sub_b IS NOT NULL THEN v_user_id END
  );

  IF v_sub_owner_id IS NOT NULL THEN
    UPDATE public.couples SET subscription_owner_id = v_sub_owner_id WHERE id = v_couple_id;
  ELSE
    UPDATE public.couples SET subscription_owner_id = NULL WHERE id = v_couple_id;
  END IF;

  -- Seed scores rows (0 points) for both partners.
  INSERT INTO public.scores (couple_id, user_id, points)
  VALUES (v_couple_id, v_user_a_id, 0), (v_couple_id, v_user_id, 0)
  ON CONFLICT (couple_id, user_id) DO NOTHING;

  -- Delete User B's solo placeholder couple.
  DELETE FROM public.couples
  WHERE user_a_id = v_user_id AND user_b_id IS NULL AND id <> v_couple_id;

  -- Fetch inviter's name and avatar for the celebration screen.
  SELECT first_name, last_name, avatar_url
  INTO v_inviter_first, v_inviter_last, v_inviter_avatar
  FROM public.profiles
  WHERE id = v_user_a_id;

  v_inviter_name := CASE
    WHEN v_inviter_last IS NOT NULL AND length(v_inviter_last) > 0
    THEN v_inviter_first || ' ' || substr(v_inviter_last, 1, 1) || '.'
    ELSE COALESCE(v_inviter_first, 'Your partner')
  END;

  RETURN jsonb_build_object(
    'ok',             true,
    'couple_id',      v_couple_id,
    'user_a_id',      v_user_a_id,
    'status',         'accepted',
    'inviter_name',   v_inviter_name,
    'inviter_avatar', v_inviter_avatar
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.request_join(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_join(text) TO authenticated;
NOTIFY pgrst, 'reload schema';
