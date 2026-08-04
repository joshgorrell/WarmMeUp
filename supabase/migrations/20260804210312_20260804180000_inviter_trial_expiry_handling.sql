/*
# Handle Inviter Trial Expiry During Pending Pairing

## Problem
When User A (inviter) generates an invite code during their free trial, then
their trial expires before User B (joiner) can be accepted, User B is left
staring at a "Waiting for confirmation" spinner indefinitely. User A gets no
prompt to subscribe, and the pending request lingers forever.

## Changes

### 1. New columns on `couples`
- `trial_expired_notified_at` (timestamptz, nullable) — records the timestamp
  when the first "your trial expired" push notification was sent to User A.
  Used to schedule the second reminder 48 hours later and to prevent
  duplicate notifications.
- `trial_expired_reminder_sent` (boolean, default false) — set to true after
  the second (48-hour) reminder push has been sent, so we don't keep pushing.

### 2. Updated `get_my_pending_join()` function
- Now also checks whether the inviter (User A) still has premium access using
  the existing `user_has_premium_access()` helper.
- Returns a new `inviter_premium_active` boolean in the response so User B's
  polling loop can detect the trial-expired state and show an appropriate
  message instead of spinning forever.

### 3. Updated `request_join()` function
- Extended the stale-request cleanup to also clear pending requests where the
  inviter no longer has premium access AND the request is older than 48 hours.
  This prevents abandoned requests from lingering indefinitely.
- The existing 30-minute stale cleanup for any pending request is preserved.

### 4. New `record_trial_expired_notification()` function
- Called by the client (User B's polling loop) when it first detects
  `inviter_premium_active = false`. Records the timestamp in
  `trial_expired_notified_at` if not already set, so the second reminder can
  be scheduled. Returns whether this was the first detection (so the client
  knows whether to fire the push notification).

## Security
- All functions are SECURITY DEFINER with `search_path = public`.
- `record_trial_expired_notification` only acts on a couple where the caller
  is the pending partner (User B), preventing User A from clearing their own
  notification timestamp.
- No new RLS policies needed — the new columns are on `couples` which already
  has couple-scoped RLS.
- No data is lost — only additive column additions and function updates.
*/

-- ── 1. Add columns to couples ──
ALTER TABLE public.couples
  ADD COLUMN IF NOT EXISTS trial_expired_notified_at timestamptz;

ALTER TABLE public.couples
  ADD COLUMN IF NOT EXISTS trial_expired_reminder_sent boolean NOT NULL DEFAULT false;

-- ── 2. Updated get_my_pending_join ──
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
  v_inviter_premium boolean;
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

    v_inviter_premium := public.user_has_premium_access(v_user_a_id);

    RETURN jsonb_build_object(
      'ok', true,
      'status', v_status,
      'couple_id', v_couple_id,
      'inviter_name', v_inviter_name,
      'inviter_avatar', v_inviter_avatar,
      'inviter_premium_active', v_inviter_premium
    );
  END IF;

  RETURN jsonb_build_object('ok', false);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_my_pending_join() TO authenticated;

-- ── 3. Updated request_join with 48h inviter-trial-expired cleanup ──
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

  -- Auto-clear pending requests where the inviter's trial expired >48h ago.
  -- This cleans up abandoned requests where neither user acted.
  UPDATE public.couples c
  SET pending_partner_id     = NULL,
      pending_partner_status  = NULL,
      pending_requested_at    = NULL,
      trial_expired_notified_at = NULL,
      trial_expired_reminder_sent = false
  WHERE user_b_id IS NULL
  AND pending_partner_id IS NOT NULL
  AND pending_partner_id <> v_user_id
  AND pending_requested_at IS NOT NULL
  AND pending_requested_at < now() - interval '48 hours'
  AND NOT public.user_has_premium_access(c.user_a_id);

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

  -- Set the pending request. Overwrites any existing pending partner (latest wins).
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
$function$;

-- ── 4. New record_trial_expired_notification ──
CREATE OR REPLACE FUNCTION public.record_trial_expired_notification(p_couple_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id   uuid;
  v_is_first  boolean;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'P0001';
  END IF;

  -- Verify the caller is the pending partner on this couple.
  IF NOT EXISTS (
    SELECT 1 FROM public.couples
    WHERE id = p_couple_id
    AND pending_partner_id = v_user_id
    AND user_b_id IS NULL
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authorized');
  END IF;

  -- Record the timestamp only if not already set.
  SELECT trial_expired_notified_at IS NULL
  INTO v_is_first
  FROM public.couples
  WHERE id = p_couple_id;

  IF v_is_first THEN
    UPDATE public.couples
    SET trial_expired_notified_at = now()
    WHERE id = p_couple_id;
    RETURN jsonb_build_object('ok', true, 'is_first', true);
  END IF;

  RETURN jsonb_build_object('ok', true, 'is_first', false);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.record_trial_expired_notification(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.record_trial_expired_notification(uuid) FROM anon;

NOTIFY pgrst, 'reload schema';
