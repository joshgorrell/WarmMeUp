/*
  # Enforce interaction status state-machine at the database level

  1. Problem
     - The `interactions` UPDATE RLS policy is couple-scoped only: either partner can
       change any column on any interaction row in their couple.
     - The app enforces the dice/dare state machine (sent -> accepted -> pending_verification
       -> completed) in client code, but a direct REST API call can skip steps — e.g. a
       receiver could jump straight to `completed`, or a sender could mark a dare
       `rejected` on behalf of the receiver.
     - There is also no guard against double-completion: tapping "They Did It!" twice
       awards completion points twice.

  2. Change
     - Add a BEFORE UPDATE trigger `guard_interaction_status_transition` that:
       - Only restricts direct REST calls made as the `authenticated` role (SECURITY
         DEFINER functions, triggers, and the service role are unaffected).
       - Validates that `status` transitions follow the allowed state machine.
       - Validates that the correct party is making the transition (receiver for
         accept/decline/self-report, sender for verify-complete).
       - Allows soft-delete (`deleted_at`) and non-status column updates without
         restriction (e.g. `is_active`, `viewed_by_partner`).

  3. Allowed transitions
     - sent -> accepted (receiver only)
     - sent -> rejected (receiver only)
     - sent -> cancelled (sender only)
     - accepted -> pending_verification (receiver only)
     - accepted -> rejected (receiver only, with decline_reason)
     - pending_verification -> completed (sender only)
     - pending_verification -> rejected (sender only)
     - Any status with deleted_at set is allowed (soft-delete).

  4. Security
     - No RLS policy changes. The trigger is an additional integrity layer on top of
       the existing couple-scoped UPDATE policy.
     - The trigger is SECURITY INVOKER so it runs with the caller's privileges.
*/

CREATE OR REPLACE FUNCTION public.guard_interaction_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  old_status text;
  new_status text;
  caller_uid uuid;
  is_sender boolean;
  is_receiver boolean;
BEGIN
  -- Only guard direct REST API calls; definer functions and the service role
  -- run as another role and are the intended paths for maintenance writes.
  IF current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;

  -- If status is not changing, allow the update (e.g. is_active, viewed_by_partner).
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  -- Soft-delete is always allowed regardless of status.
  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    RETURN NEW;
  END IF;

  old_status := OLD.status;
  new_status := NEW.status;
  caller_uid := auth.uid();
  is_sender := (OLD.sender_id = caller_uid);
  is_receiver := (OLD.receiver_id = caller_uid);

  -- sent -> accepted (receiver only)
  IF old_status = 'sent' AND new_status = 'accepted' THEN
    IF NOT is_receiver THEN
      RAISE EXCEPTION 'Only the receiver can accept a challenge'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- sent -> rejected (receiver only)
  IF old_status = 'sent' AND new_status = 'rejected' THEN
    IF NOT is_receiver THEN
      RAISE EXCEPTION 'Only the receiver can reject a challenge'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- sent -> cancelled (sender only)
  IF old_status = 'sent' AND new_status = 'cancelled' THEN
    IF NOT is_sender THEN
      RAISE EXCEPTION 'Only the sender can cancel a challenge'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- accepted -> pending_verification (receiver only)
  IF old_status = 'accepted' AND new_status = 'pending_verification' THEN
    IF NOT is_receiver THEN
      RAISE EXCEPTION 'Only the receiver can report completion'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- accepted -> rejected (receiver only, e.g. decline after accepting)
  IF old_status = 'accepted' AND new_status = 'rejected' THEN
    IF NOT is_receiver THEN
      RAISE EXCEPTION 'Only the receiver can reject a challenge'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- pending_verification -> completed (sender only)
  IF old_status = 'pending_verification' AND new_status = 'completed' THEN
    IF NOT is_sender THEN
      RAISE EXCEPTION 'Only the sender can verify completion'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- pending_verification -> rejected (sender only, e.g. sender denies the self-report)
  IF old_status = 'pending_verification' AND new_status = 'rejected' THEN
    IF NOT is_sender THEN
      RAISE EXCEPTION 'Only the sender can reject a pending verification'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- Any other transition is disallowed.
  RAISE EXCEPTION 'Invalid status transition from % to %', old_status, new_status
    USING ERRCODE = '44000';
END;
$$;

DROP TRIGGER IF EXISTS guard_interaction_status_transition_trigger ON public.interactions;

CREATE TRIGGER guard_interaction_status_transition_trigger
  BEFORE UPDATE ON public.interactions
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_interaction_status_transition();
