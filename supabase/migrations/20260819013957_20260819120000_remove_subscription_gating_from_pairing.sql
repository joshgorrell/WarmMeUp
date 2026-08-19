/*
# Remove Subscription Gating from Partner Pairing

## Business Rule
Two users can partner with each other as long as neither user already has a
partner. Their subscription or trial status has NO bearing on pairing
eligibility. The only thing that blocks pairing is already being connected
to another real partner.

## Changes

### 1. `request_join(invite_code text)` — removed premium-access check
Previously the function returned `no_subscription` if the inviter (User A)
did not have premium access. This blocked valid pairings where, e.g., User A
had an expired trial and User B had a paid subscription. The check is
removed entirely. The `already_connected`, `not_found`, `self`, and
`rate_limited` checks remain unchanged.

### 2. `accept_partner()` — removed premium-access check
Previously the function returned `no_subscription` if the inviter's premium
access lapsed while a request was pending. This is removed — the inviter's
subscription status must not block finalization.

### 3. `generate_invite_code()` — removed premium-access check
Previously the function returned `{ success: false, reason: 'no_subscription' }`
if the caller did not have premium access. This prevented users with expired
trials from generating invite codes to send to paid partners. The check is
removed. The `already_paired` guard remains.

### 4. `get_my_pending_join()` — `inviter_premium_active` always true
The `inviter_premium_active` field was used by the client to detect the
"inviter trial expired" state and show a blocking modal. Since subscription
status no longer affects pairing, this field is now always `true`. The
client-side trial-expired waiting state is being removed separately.

### 5. Stale-request cleanup for expired inviters — removed
The 48-hour cleanup that cleared pending requests where the inviter no longer
had premium access is removed. Pending requests are still cleaned up after
30 minutes of inactivity (the existing stale-request cleanup), which is
sufficient.

## Security
- All functions remain SECURITY DEFINER with `search_path = public`.
- No new tables, columns, or RLS policies.
- No data is lost — only function definitions change.
*/

-- ── 1. Recreate request_join WITHOUT subscription gating ──
CREATE OR REPLACE FUNCTION public.request_join(invite_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
DECLARE
  v_user_id      uuid;
  v_couple_id    uuid;
  v_user_a_id    uuid;
  v_attempts     int;
  v_window       timestamptz;
  v_sub_owner_id uuid;
  v_sub_a        uuid;
  v_sub_b        uuid;
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
  AND user_b_id IS NULL
  LIMIT 1;

  IF v_couple_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  IF v_user_a_id = v_user_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'self');
  END IF;

  -- ── All validation passed — now safe to clean up caller's prior pending requests ──
  UPDATE public.couples
  SET pending_partner_id     = NULL,
      pending_partner_status  = NULL,
      pending_requested_at    = NULL
  WHERE pending_partner_id = v_user_id
  AND user_b_id IS NULL;

  -- ── Finalize the connection immediately ──
  UPDATE public.couples
  SET user_b_id              = v_user_id,
      active                 = true,
      invite_code_used_at    = now(),
      pending_partner_status = 'accepted',
      pending_partner_id     = NULL,
      pending_requested_at   = NULL
  WHERE id = v_couple_id
  AND user_b_id IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  -- Reset rate limit on success.
  UPDATE public.invite_join_attempts
  SET attempt_count = 0, window_start = now()
  WHERE user_id = v_user_id;

  -- ── Stamp subscription_owner_id ──
  -- Prefers User A's subscription, falls back to User B's. This does NOT
  -- cancel or merge either subscription — it only records who the primary
  -- subscriber is for access purposes. Both subscriptions remain active.
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
  END IF;

  -- ── Seed scores rows (0 points) for both partners ──
  INSERT INTO public.scores (couple_id, user_id, points)
  VALUES (v_couple_id, v_user_a_id, 0), (v_couple_id, v_user_id, 0)
  ON CONFLICT (couple_id, user_id) DO NOTHING;

  -- ── Delete User B's solo placeholder couple ──
  DELETE FROM public.couples
  WHERE user_a_id = v_user_id AND user_b_id IS NULL AND id <> v_couple_id;

  RETURN jsonb_build_object(
    'ok',        true,
    'couple_id', v_couple_id,
    'user_a_id', v_user_a_id,
    'status',    'accepted'
  );
END;
$function$;

-- ── 2. Recreate accept_partner WITHOUT subscription gating ──
CREATE OR REPLACE FUNCTION public.accept_partner()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_user_id      uuid;
  v_couple_id    uuid;
  v_partner_id   uuid;
  v_sub_owner_id uuid;
  v_sub_a        uuid;
  v_sub_b        uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'P0001';
  END IF;

  SELECT id, pending_partner_id
  INTO v_couple_id, v_partner_id
  FROM public.couples
  WHERE user_a_id = v_user_id
    AND pending_partner_status IN ('pending', 'b_accepted')
    AND user_b_id IS NULL
  LIMIT 1;

  IF v_couple_id IS NULL OR v_partner_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_pending_request');
  END IF;

  UPDATE public.couples
  SET user_b_id              = v_partner_id,
      active                 = true,
      invite_code_used_at    = now(),
      pending_partner_status = 'accepted',
      pending_partner_id     = NULL,
      pending_requested_at   = NULL
  WHERE id = v_couple_id
    AND user_a_id = v_user_id
    AND pending_partner_status IN ('pending', 'b_accepted')
    AND user_b_id IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_full');
  END IF;

  -- ── Stamp subscription_owner_id ──
  SELECT id INTO v_sub_a FROM public.subscriptions
  WHERE user_id = v_user_id AND status = 'active' LIMIT 1;
  SELECT id INTO v_sub_b FROM public.subscriptions
  WHERE user_id = v_partner_id AND status = 'active' LIMIT 1;

  v_sub_owner_id := COALESCE(
    CASE WHEN v_sub_a IS NOT NULL THEN v_user_id END,
    CASE WHEN v_sub_b IS NOT NULL THEN v_partner_id END
  );

  IF v_sub_owner_id IS NOT NULL THEN
    UPDATE public.couples SET subscription_owner_id = v_sub_owner_id WHERE id = v_couple_id;
  END IF;

  -- ── Seed scores rows (0 points) for both partners ──
  INSERT INTO public.scores (couple_id, user_id, points)
  VALUES (v_couple_id, v_user_id, 0), (v_couple_id, v_partner_id, 0)
  ON CONFLICT (couple_id, user_id) DO NOTHING;

  -- ── Delete User B's solo placeholder couple ──
  DELETE FROM public.couples
  WHERE user_a_id = v_partner_id AND user_b_id IS NULL AND id <> v_couple_id;

  RETURN jsonb_build_object('ok', true, 'couple_id', v_couple_id, 'user_b_id', v_partner_id);
END;
$$;

-- ── 3. Recreate generate_invite_code WITHOUT subscription gating ──
CREATE OR REPLACE FUNCTION public.generate_invite_code()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_user_id   uuid;
  v_couple_id uuid;
  v_code      text;
  v_alphabet  text := 'ACDEFGHJKLMNPQRTUVWXY34679';
  v_attempts  int  := 0;
  i           int;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'P0001';
  END IF;

  -- Refuse if the caller is already in an active paired couple.
  IF EXISTS (
    SELECT 1 FROM public.couples
    WHERE (user_a_id = v_user_id OR user_b_id = v_user_id)
      AND user_b_id IS NOT NULL
      AND active = true
  ) THEN
    RAISE EXCEPTION 'already_paired' USING ERRCODE = 'P0003';
  END IF;

  -- Generate a unique 6-char code from the safe alphabet
  LOOP
    v_code := '';
    FOR i IN 1..6 LOOP
      v_code := v_code || substr(v_alphabet, floor(random() * length(v_alphabet))::int + 1, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.couples WHERE invite_code = v_code);
    v_attempts := v_attempts + 1;
    IF v_attempts > 20 THEN
      RAISE EXCEPTION 'Could not generate unique invite code after 20 attempts' USING ERRCODE = 'P0002';
    END IF;
  END LOOP;

  -- Find any solo couple for this user (active or inactive) — prefer active
  SELECT id INTO v_couple_id
  FROM public.couples
  WHERE user_a_id = v_user_id AND user_b_id IS NULL
  ORDER BY active DESC, created_at DESC
  LIMIT 1;

  IF v_couple_id IS NOT NULL THEN
    UPDATE public.couples SET invite_code = v_code, active = true WHERE id = v_couple_id;
  ELSE
    INSERT INTO public.couples (
      user_a_id, user_b_id, active, invite_code,
      subscription_owner_id, points_enabled, streaks_enabled
    ) VALUES (
      v_user_id, NULL, true, v_code, v_user_id, true, true
    )
    RETURNING id INTO v_couple_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'invite_code', v_code, 'couple_id', v_couple_id);
END;
$$;

REVOKE ALL ON FUNCTION public.generate_invite_code() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.generate_invite_code() FROM anon;
GRANT EXECUTE ON FUNCTION public.generate_invite_code() TO authenticated;

-- ── 4. Recreate get_my_pending_join with inviter_premium_active always true ──
CREATE OR REPLACE FUNCTION public.get_my_pending_join()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id   uuid;
  v_couple_id uuid;
  v_user_a_id uuid;
  v_inviter_name text;
  v_inviter_avatar text;
  v_status   text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'P0001';
  END IF;

  -- Check if already accepted (user_b_id is set to this user)
  SELECT c.id, c.user_a_id
  INTO v_couple_id, v_user_a_id
  FROM public.couples c
  WHERE c.user_b_id = v_user_id
  AND c.active = true
  LIMIT 1;

  IF v_couple_id IS NOT NULL THEN
    SELECT display_name, avatar_url
    INTO v_inviter_name, v_inviter_avatar
    FROM public.profiles
    WHERE id = v_user_a_id;

    RETURN jsonb_build_object(
      'ok', true,
      'status', 'accepted',
      'couple_id', v_couple_id,
      'inviter_name', v_inviter_name,
      'inviter_avatar', v_inviter_avatar,
      'inviter_premium_active', true
    );
  END IF;

  -- Check for pending request
  SELECT c.id, c.user_a_id, c.pending_partner_status
  INTO v_couple_id, v_user_a_id, v_status
  FROM public.couples c
  WHERE c.pending_partner_id = v_user_id
  AND c.user_b_id IS NULL
  LIMIT 1;

  IF v_couple_id IS NOT NULL THEN
    SELECT display_name, avatar_url
    INTO v_inviter_name, v_inviter_avatar
    FROM public.profiles
    WHERE id = v_user_a_id;

    RETURN jsonb_build_object(
      'ok', true,
      'status', v_status,
      'couple_id', v_couple_id,
      'inviter_name', v_inviter_name,
      'inviter_avatar', v_inviter_avatar,
      'inviter_premium_active', true
    );
  END IF;

  RETURN jsonb_build_object('ok', false);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_my_pending_join() TO authenticated;

NOTIFY pgrst, 'reload schema';
