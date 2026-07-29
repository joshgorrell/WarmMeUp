/*
# Fix Partner Invite/Pairing Reliability

## Problem
When User B retries a join request (because the app was closed, realtime dropped,
or they tapped again), the `request_join` function blocks them with "not_found"
because their previous pending request is still sitting on the couple row
(up to 30 minutes before auto-clear). This makes pairing "take a few tries."

## Changes

### 1. Updated `request_join(invite_code text)` function
- **Self-clear**: Before looking up the invite code, clears any existing pending
  request that the calling user (User B) placed on ANY couple. This makes retries
  instant — User B is never blocked by their own previous attempt.
- **Latest-partner-wins**: No longer requires `pending_partner_id IS NULL` on the
  target couple. If someone else's request is pending, it gets overwritten by the
  new request. This eliminates the confusing "already_full" / "someone else is
  connecting" error entirely.
- **Higher rate limit**: Raised from 5 to 10 attempts per 10-minute window, and
  self-clear retries don't count against the limit (counter resets on success).
- Removed `already_full` return path (no longer reachable).

### 2. New `get_my_pending_join()` function
- Returns the calling user's pending join request status (if any).
- Used by the client to:
  a) Detect and resume an existing pending request when User B reopens the app.
  b) Poll for status changes as a realtime fallback while waiting.
- Returns `{ ok: true, status: 'accepted', couple_id, inviter_name, inviter_avatar }`
  if the user has been accepted (user_b_id is set).
- Returns `{ ok: true, status: 'b_accepted'|'pending', couple_id, inviter_name, inviter_avatar }`
  if the user has a pending request.
- Returns `{ ok: false }` if no pending request and not accepted.

## Security
- Both functions are SECURITY DEFINER, scoped to `public` search_path.
- `request_join` uses `auth.uid()` for identity — never trusts client input.
- `get_my_pending_join` only returns data for the calling user's own request.
- No new tables. No RLS policy changes.
*/

-- ── 1. Updated request_join ──
CREATE OR REPLACE FUNCTION public.request_join(invite_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  -- This makes retries instant — User B is never blocked by their own previous attempt.
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

  -- Find the couple with this invite code. Don't require pending_partner_id IS NULL —
  -- latest partner wins, so we overwrite any existing pending request.
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

  -- Set the pending request. Overwrites any existing pending partner (latest wins).
  UPDATE public.couples
  SET pending_partner_id     = v_user_id,
      pending_partner_status = 'b_accepted',
      pending_requested_at   = now()
  WHERE id = v_couple_id
  AND user_b_id IS NULL;

  IF NOT FOUND THEN
    -- Race condition: couple was finalized between SELECT and UPDATE.
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
$function$;

-- ── 2. New get_my_pending_join ──
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
      'inviter_avatar', v_inviter_avatar
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
      'inviter_avatar', v_inviter_avatar
    );
  END IF;

  RETURN jsonb_build_object('ok', false);
END;
$function$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.get_my_pending_join() TO authenticated;
