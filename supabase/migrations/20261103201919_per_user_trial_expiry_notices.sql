/*
# Per-user trial expiry notice tracking

1. Modified Tables
- `profiles`
  - `trial_expiry_notice_for` (timestamptz, nullable): the trial expiration (trial end plus 24h grace) that this user's notice was recorded for.
  - `trial_expiry_notice_status` (text, nullable): one of `pending`, `sent`, `uncertain`, `failed`, `unreachable`.
    - `pending`: a send is in progress or was interrupted. Not resent automatically.
    - `sent`: the notice was accepted for delivery, or shown in the app to the inviter. Never resent.
    - `uncertain`: delivery could not be confirmed. Not resent, to avoid duplicates.
    - `failed`: the send was definitely rejected. Eligible for retry on the next scheduled run.
    - `unreachable`: no valid push token. Not retried for this expiration.

2. Functions
- `record_trial_expired_notification(couple_id)` now records the in-app expiry prompt on the inviter's own profile. It no longer writes the shared `couples.trial_expired_notified_at` column.

3. Security
- The new columns receive no grants to `anon` or `authenticated`. Only the service role (scheduler) and the security definer function above write them.
- The function keeps its existing caller checks and EXECUTE grants.

4. Notes
- `couples.trial_expired_notified_at` is left in place and is no longer read or written by the scheduler or the in-app prompt.
*/

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS trial_expiry_notice_for timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS trial_expiry_notice_status text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_trial_expiry_notice_status_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_trial_expiry_notice_status_check
      CHECK (trial_expiry_notice_status IN ('pending', 'sent', 'uncertain', 'failed', 'unreachable'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.record_trial_expired_notification(p_couple_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id    uuid;
  v_inviter_id uuid;
  v_expires    timestamptz;
  v_expiration timestamptz;
  v_recorded   integer;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.couples
    WHERE id = p_couple_id
      AND user_b_id IS NULL
      AND (
        pending_partner_id = v_user_id
        OR (user_a_id = v_user_id AND pending_partner_status IS NOT NULL)
      )
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authorized');
  END IF;

  SELECT user_a_id INTO v_inviter_id FROM public.couples WHERE id = p_couple_id;
  IF v_inviter_id IS DISTINCT FROM v_user_id THEN
    RETURN jsonb_build_object('ok', true, 'is_first', false);
  END IF;

  SELECT max(expires_at) INTO v_expires
  FROM public.subscriptions
  WHERE user_id = v_inviter_id AND plan = 'trial';

  IF v_expires IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_trial');
  END IF;

  v_expiration := v_expires + interval '24 hours';

  UPDATE public.profiles
  SET trial_expiry_notice_for = v_expiration,
      trial_expiry_notice_status = 'sent'
  WHERE id = v_inviter_id
    AND (
      trial_expiry_notice_for IS NULL
      OR trial_expiry_notice_for <> v_expiration
      OR trial_expiry_notice_status = 'failed'
    );
  GET DIAGNOSTICS v_recorded = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'is_first', v_recorded > 0);
END;
$function$;

NOTIFY pgrst, 'reload schema';
