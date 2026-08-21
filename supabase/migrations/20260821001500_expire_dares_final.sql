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

-- If a stale client acts after a Dare timer elapsed, force the terminal expired state.
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

-- Extend the existing interaction state machine so the database itself permits
-- only a legitimate Dare -> expired transition after the timer has elapsed.
DROP TRIGGER IF EXISTS guard_interaction_status_transition_trigger ON public.interactions;
DROP FUNCTION IF EXISTS public.guard_interaction_status_transition();

CREATE OR REPLACE FUNCTION public.guard_interaction_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  old_status text;
  new_status text;
  caller_uid uuid;
  is_sender boolean;
  is_receiver boolean;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    RETURN NEW;
  END IF;

  old_status := OLD.status;
  new_status := NEW.status;
  caller_uid := auth.uid();
  is_sender := (OLD.sender_id = caller_uid);
  is_receiver := (OLD.receiver_id = caller_uid);

  -- Expiration is terminal and may be performed by the cleanup job or by a stale
  -- client write that the expiration trigger converted to `expired`.
  IF OLD.type = 'dare'
     AND new_status = 'expired'
     AND old_status IN ('sent', 'seen', 'accepted', 'pending_verification')
     AND OLD.expires_at IS NOT NULL
     AND OLD.expires_at <= now() THEN
    NEW.is_active := false;
    RETURN NEW;
  END IF;

  IF old_status = 'sent' AND new_status = 'seen' THEN
    IF NOT is_receiver THEN
      RAISE EXCEPTION 'Only the receiver can mark a challenge as seen' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF old_status = 'seen' AND new_status = 'accepted' THEN
    IF NOT is_receiver THEN
      RAISE EXCEPTION 'Only the receiver can accept a challenge' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF old_status = 'seen' AND new_status = 'rejected' THEN
    IF NOT is_receiver THEN
      RAISE EXCEPTION 'Only the receiver can reject a challenge' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF old_status = 'seen' AND new_status = 'cancelled' THEN
    IF NOT is_sender THEN
      RAISE EXCEPTION 'Only the sender can cancel a challenge' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF old_status = 'seen' AND new_status = 'pending_verification' THEN
    IF NOT is_receiver THEN
      RAISE EXCEPTION 'Only the receiver can report completion' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF old_status = 'sent' AND new_status = 'accepted' THEN
    IF NOT is_receiver THEN
      RAISE EXCEPTION 'Only the receiver can accept a challenge' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF old_status = 'sent' AND new_status = 'rejected' THEN
    IF NOT is_receiver THEN
      RAISE EXCEPTION 'Only the receiver can reject a challenge' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF old_status = 'sent' AND new_status = 'cancelled' THEN
    IF NOT is_sender THEN
      RAISE EXCEPTION 'Only the sender can cancel a challenge' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF old_status = 'accepted' AND new_status = 'pending_verification' THEN
    IF NOT is_receiver THEN
      RAISE EXCEPTION 'Only the receiver can report completion' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF old_status = 'accepted' AND new_status = 'rejected' THEN
    IF NOT is_receiver THEN
      RAISE EXCEPTION 'Only the receiver can reject a challenge' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF old_status = 'pending_verification' AND new_status = 'completed' THEN
    IF NOT is_sender THEN
      RAISE EXCEPTION 'Only the sender can verify completion' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF old_status = 'pending_verification' AND new_status = 'rejected' THEN
    IF NOT is_sender THEN
      RAISE EXCEPTION 'Only the sender can reject a pending verification' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Invalid status transition from % to %', old_status, new_status
    USING ERRCODE = '44000';
END;
$$;

CREATE TRIGGER guard_interaction_status_transition_trigger
  BEFORE UPDATE ON public.interactions
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_interaction_status_transition();

-- Run once per minute so sender and receiver devices are updated through the
-- existing realtime interactions subscription even when neither touches the Dare.
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
