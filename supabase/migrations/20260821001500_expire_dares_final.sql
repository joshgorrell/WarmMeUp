-- Make Dare expiration final and server-authoritative.
-- Once expires_at has passed, an unfinished dare becomes `expired`, is inactive,
-- and cannot be accepted/completed later from a stale screen, deep link, or device.

ALTER TABLE public.interactions
  DROP CONSTRAINT IF EXISTS interactions_status_check;

ALTER TABLE public.interactions
  ADD CONSTRAINT interactions_status_check
  CHECK (status IN (
    'sent',
    'seen',
    'accepted',
    'rejected',
    'completed',
    'answered',
    'pending_verification',
    'cancelled',
    'expired'
  ));

CREATE OR REPLACE FUNCTION public.expire_due_dares()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected integer := 0;
BEGIN
  UPDATE public.interactions
  SET
    status = 'expired',
    is_active = false
  WHERE type = 'dare'
    AND deleted_at IS NULL
    AND expires_at IS NOT NULL
    AND expires_at <= now()
    AND status IN ('sent', 'seen', 'accepted', 'pending_verification');

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_due_dares() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expire_due_dares() TO service_role;

-- This trigger runs before the existing interaction state-machine trigger.
-- If a stale client tries to act on a Dare whose timer already elapsed,
-- force the Dare into its final expired state instead of allowing resurrection.
CREATE OR REPLACE FUNCTION public.enforce_dare_expiration()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.type = 'dare'
     AND OLD.deleted_at IS NULL
     AND OLD.expires_at IS NOT NULL
     AND OLD.expires_at <= now()
     AND OLD.status IN ('sent', 'seen', 'accepted', 'pending_verification') THEN
    NEW.status := 'expired';
    NEW.is_active := false;
    NEW.completed_at := NULL;
    NEW.completion_requested_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_dare_expiration_trigger ON public.interactions;
CREATE TRIGGER enforce_dare_expiration_trigger
  BEFORE UPDATE ON public.interactions
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_dare_expiration();

-- Supabase projects normally include pg_cron. Run once per minute so an expired
-- Dare disappears from both partners' active UI through the existing realtime
-- interactions subscription even when neither user taps anything.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule('expire-due-dares');
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    PERFORM cron.schedule(
      'expire-due-dares',
      '* * * * *',
      'SELECT public.expire_due_dares();'
    );
  END IF;
END;
$$;

-- Immediately close any Dares that were already past due when this migration lands.
SELECT public.expire_due_dares();
