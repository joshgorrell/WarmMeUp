/*
# Clean up accidental trial subscription after pairing

## Problem
When User B signs up via OAuth (Apple/Google) and then joins User A's couple via
`request_join()`, the signup trigger auto-creates a 7-day trial subscription for
User B. This trial is unnecessary because User B is now part of a couple where
User A's subscription covers both partners. The accidental trial can cause
confusion in the subscription system and incorrectly set User B as the
subscription_owner_id.

## Solution
Modify `request_join()` to delete User B's auto-generated trial subscription
after pairing succeeds, then recalculate `subscription_owner_id` based on
remaining active subscriptions.

## Rules
- Only delete `plan = 'trial'` subscriptions for User B (the joining user).
- Never delete `monthly` or `yearly` subscriptions.
- Perform cleanup only after pairing succeeds (after user_b_id is set).
- Recalculate `subscription_owner_id` after the trial is removed.

## Security
- No new tables or policies.
- `request_join` remains SECURITY DEFINER with pinned search_path.
- No changes to RLS or column privileges.
*/

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
    AND user_b_id IS NULL
  LIMIT 1;

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

  -- Delete User B's auto-generated trial subscription (never paid plans).
  -- This cleanup happens only after pairing has succeeded.
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