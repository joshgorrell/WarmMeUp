/*
# Fix Partner Pairing Reliability

## Problem
The partner pairing flow was failing for real users (Neal and Cora) due to
several issues in the server-side pairing functions:

1. **Invite code regenerated on every call**: `generate_invite_code()`
   always created a new random code and overwrote the existing one, even
   if the couple already had a valid, unused invite code. This meant that
   if User A sent their code to User B and then reopened the app, the code
   changed and User B's entry of the old code returned "not_found".

2. **Pending requests auto-cleared after 30 minutes**: The `request_join()`
   function automatically cleared pending requests older than 30 minutes
   from other users. If User B sent a request and User A didn't accept
   within 30 minutes, the next `request_join` call from anyone would
   silently wipe User B's request — with no notification to either user.

## Changes

### 1. `generate_invite_code()` — Preserve existing unused codes
- Before generating a new random code, check whether the caller's solo
  couple already has an invite_code and user_b_id IS NULL (i.e., the code
  hasn't been used yet). If so, return the existing code instead of
  generating a new one.
- Only generate a new code when the couple has no existing invite_code
  or the previous code was already used (user_b_id IS NOT NULL, which
  shouldn't happen here since we check `already_paired` above, but is
  a safety net).

### 2. `request_join()` — Increase stale-request timeout to 24 hours
- Changed the auto-clear threshold from `interval '30 minutes'` to
  `interval '24 hours'`. Pending requests now stay alive for a full day,
  giving User A ample time to see and accept the request.
- This is a targeted change to a single interval literal; no other logic
  in `request_join` is modified.

## Security
- No RLS policy changes.
- No new tables or columns.
- Both functions remain SECURITY DEFINER with `search_path = public`.
- Execute grants unchanged: `authenticated` only, `anon` revoked.
*/

-- ─── generate_invite_code: preserve existing unused code ──────────────
CREATE OR REPLACE FUNCTION public.generate_invite_code()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id   uuid;
  v_couple_id uuid;
  v_code      text;
  v_existing  text;
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

  -- Inviter (User A) must have premium access (paid sub, trial, admin grant,
  -- or admin flag). User B never calls this RPC.
  IF NOT public.user_has_premium_access(v_user_id) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'no_subscription');
  END IF;

  -- Find any solo couple for this user (active or inactive) — prefer active
  SELECT id, invite_code
  INTO v_couple_id, v_existing
  FROM public.couples
  WHERE user_a_id = v_user_id AND user_b_id IS NULL
  ORDER BY active DESC, created_at DESC
  LIMIT 1;

  -- If the couple already has an unused invite code, return it as-is.
  -- This prevents the code from changing every time the user opens the app.
  IF v_couple_id IS NOT NULL AND v_existing IS NOT NULL THEN
    -- Ensure the couple is marked active so the code is usable.
    UPDATE public.couples SET active = true WHERE id = v_couple_id AND active = false;
    RETURN jsonb_build_object('success', true, 'invite_code', v_existing, 'couple_id', v_couple_id);
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

-- ─── request_join: increase stale-request timeout to 24 hours ──────────
CREATE OR REPLACE FUNCTION public.request_join(invite_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id   uuid;
  v_couple_id uuid;
  v_user_a_id uuid;
  v_attempts  int;
  v_window    timestamptz;
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

  -- Clear any existing pending request that THIS user placed on any couple.
  UPDATE public.couples
  SET pending_partner_id     = NULL,
      pending_partner_status  = NULL,
      pending_requested_at    = NULL
  WHERE pending_partner_id = v_user_id
    AND user_b_id IS NULL;

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
      -- Log the rate-limit event before returning.
      INSERT INTO public.security_events (event_type, user_id, detail)
      VALUES (
        'invite_rate_limited',
        v_user_id,
        jsonb_build_object(
          'invite_code', request_join.invite_code,
          'attempt_count', v_attempts + 1
        )
      );
      RETURN jsonb_build_object('ok', false, 'reason', 'rate_limited');
    END IF;
  END IF;

  -- Auto-clear stale pending requests (>24 hours old) from other users.
  -- Increased from 30 minutes to give User A ample time to accept.
  UPDATE public.couples
  SET pending_partner_id     = NULL,
      pending_partner_status  = NULL,
      pending_requested_at    = NULL
  WHERE user_b_id IS NULL
    AND pending_partner_id IS NOT NULL
    AND pending_partner_id <> v_user_id
    AND pending_requested_at IS NOT NULL
    AND pending_requested_at < now() - interval '24 hours';

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

  -- Set the pending request.
  UPDATE public.couples
  SET pending_partner_id     = v_user_id,
      pending_partner_status = 'b_accepted',
      pending_requested_at   = now()
  WHERE id = v_couple_id
    AND user_b_id IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  -- Reset rate limit on success.
  UPDATE public.invite_join_attempts
  SET attempt_count = 0, window_start = now()
  WHERE user_id = v_user_id;

  RETURN jsonb_build_object(
    'ok',        true,
    'couple_id', v_couple_id,
    'user_a_id', v_user_a_id,
    'status',    'b_accepted'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.request_join(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.request_join(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.request_join(text) TO authenticated;
