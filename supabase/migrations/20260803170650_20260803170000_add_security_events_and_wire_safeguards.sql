/*
# Add security_events table, wire safeguards to log, add security monitor loop

## Purpose
The AI Ops center has no visibility into security-relevant events. Two existing
safeguards — the admin self-elevation block trigger and the invite rate-limiter
— fire silently. This migration creates a `security_events` table to capture
those events, updates both safeguards to insert rows when they fire, and adds
a new AI Ops loop type ('security_anomaly_monitor') plus a 'pending_review'
issue status for the require_human_approval flow.

## New Tables

### security_events
- `id` (uuid, primary key)
- `event_type` (text, not null) — e.g. 'admin_self_elevation_blocked', 'invite_rate_limited'
- `user_id` (uuid, nullable) — the acting user, when known
- `detail` (jsonb, nullable) — structured context (attempted values, invite code, etc.)
- `created_at` (timestamptz, default now())

## Modified Tables

### ai_loop_settings / ai_loop_runs — loop_type CHECK constraint
- Added 'security_anomaly_monitor' to the allowed loop_type values.

### ai_issues — status CHECK constraint
- Added 'pending_review' to the allowed status values, for the require_human_approval flow.

## Modified Database Functions

### protect_profile_admin_flags() — BEFORE UPDATE trigger on profiles
- Existing behavior: reverts is_admin / is_super_admin to OLD values when the
  acting user is not a super-admin.
- New behavior: before reverting, if is_admin or is_super_admin actually
  changed (NEW vs OLD), inserts a security_events row with event_type
  'admin_self_elevation_blocked', the acting user_id, and a detail JSON
  containing the attempted values.

### request_join(invite_code text) — SECURITY DEFINER function
- Existing behavior: returns {ok:false, reason:'rate_limited'} after 10
  attempts in 10 minutes.
- New behavior: before returning rate_limited, inserts a security_events
  row with event_type 'invite_rate_limited', the acting user_id, and a
  detail JSON containing the invite_code string the caller supplied.

## Security
- RLS enabled on security_events.
- SELECT policy: admins (is_admin or is_super_admin) only.
- No INSERT / UPDATE / DELETE policies — only SECURITY DEFINER functions
  write to this table, so regular users and anon cannot insert fake events
  or tamper with existing ones.
- Both modified functions remain SECURITY DEFINER with search_path = 'public'.
*/

-- ── 1. Create security_events table ──
CREATE TABLE IF NOT EXISTS public.security_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  user_id uuid,
  detail jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;

-- Admin-only SELECT policy
DROP POLICY IF EXISTS "admin_select_security_events" ON public.security_events;
CREATE POLICY "admin_select_security_events" ON public.security_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND (profiles.is_admin = true OR profiles.is_super_admin = true)
    )
  );

-- Indexes for time-range and type queries used by the security monitor loop
CREATE INDEX IF NOT EXISTS idx_security_events_created_at
  ON public.security_events (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_security_events_event_type
  ON public.security_events (event_type);

CREATE INDEX IF NOT EXISTS idx_security_events_user_id
  ON public.security_events (user_id);

-- ── 2. Expand loop_type CHECK constraints to include 'security_anomaly_monitor' ──
ALTER TABLE public.ai_loop_settings
  DROP CONSTRAINT IF EXISTS ai_loop_settings_loop_type_check;
ALTER TABLE public.ai_loop_settings
  ADD CONSTRAINT ai_loop_settings_loop_type_check
  CHECK (loop_type IN ('daily_brief', 'signup_monitor', 'bug_analyzer', 'security_anomaly_monitor'));

ALTER TABLE public.ai_loop_runs
  DROP CONSTRAINT IF EXISTS ai_loop_runs_loop_type_check;
ALTER TABLE public.ai_loop_runs
  ADD CONSTRAINT ai_loop_runs_loop_type_check
  CHECK (loop_type IN ('daily_brief', 'signup_monitor', 'bug_analyzer', 'security_anomaly_monitor'));

-- ── 3. Expand ai_issues status CHECK to include 'pending_review' ──
ALTER TABLE public.ai_issues
  DROP CONSTRAINT IF EXISTS ai_issues_status_check;
ALTER TABLE public.ai_issues
  ADD CONSTRAINT ai_issues_status_check
  CHECK (status IN ('open', 'resolved', 'dismissed', 'pending_review'));

-- ── 4. Seed ai_loop_settings for the new security monitor loop ──
INSERT INTO public.ai_loop_settings (loop_type, enabled, require_human_approval)
VALUES ('security_anomaly_monitor', true, false)
ON CONFLICT (loop_type) DO NOTHING;

-- ── 5. Update protect_profile_admin_flags trigger function ──
CREATE OR REPLACE FUNCTION public.protect_profile_admin_flags()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- If the acting user is a super-admin, allow any change.
  IF is_super_admin() THEN
    RETURN NEW;
  END IF;

  -- Non-super-admin: log the attempt if flags actually changed, then revert.
  IF NEW.is_admin IS DISTINCT FROM OLD.is_admin
     OR NEW.is_super_admin IS DISTINCT FROM OLD.is_super_admin THEN
    INSERT INTO public.security_events (event_type, user_id, detail)
    VALUES (
      'admin_self_elevation_blocked',
      auth.uid(),
      jsonb_build_object(
        'target_user_id', NEW.id,
        'attempted_is_admin', NEW.is_admin,
        'attempted_is_super_admin', NEW.is_super_admin,
        'previous_is_admin', OLD.is_admin,
        'previous_is_super_admin', OLD.is_super_admin
      )
    );
  END IF;

  -- Silently revert admin flags to their previous values.
  NEW.is_admin := OLD.is_admin;
  NEW.is_super_admin := OLD.is_super_admin;

  RETURN NEW;
END;
$function$;

-- Reattach the trigger (idempotent)
DROP TRIGGER IF EXISTS protect_profile_admin_flags_trigger ON public.profiles;
CREATE TRIGGER protect_profile_admin_flags_trigger
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_admin_flags();

-- ── 6. Update request_join to log rate-limit events ──
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
$function$;
