/*
# Add "seen" status to interaction state machine

## Purpose
When a receiver opens a dare/dice challenge, the status transitions from
"sent" to "seen". This lets the sender know their partner has looked at it.
The "seen" status is a soft gate — it does not block any subsequent action;
the receiver can still accept, reject, or let it expire, and the sender can
still cancel.

## Changes
1. Drop and recreate the `guard_interaction_status_transition` trigger function
   with the following additional allowed transitions:
   - sent -> seen (receiver only) — marks the challenge as viewed
   - seen -> accepted (receiver only)
   - seen -> rejected (receiver only)
   - seen -> cancelled (sender only)
   - seen -> pending_verification (receiver only, for self-roll dice edge case)
2. All existing transitions remain unchanged.

## Security
- The trigger only restricts direct REST calls made as the `authenticated` role.
  SECURITY DEFINER functions, triggers, and the service role are unaffected.
- `seen` transitions enforce the same sender/receiver ownership as existing ones.
*/

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
  -- No status change? Allow (e.g. only viewed_by_partner flipped).
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

  -- sent -> seen (receiver only)
  IF old_status = 'sent' AND new_status = 'seen' THEN
    IF NOT is_receiver THEN
      RAISE EXCEPTION 'Only the receiver can mark a challenge as seen'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- seen -> accepted (receiver only)
  IF old_status = 'seen' AND new_status = 'accepted' THEN
    IF NOT is_receiver THEN
      RAISE EXCEPTION 'Only the receiver can accept a challenge'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- seen -> rejected (receiver only)
  IF old_status = 'seen' AND new_status = 'rejected' THEN
    IF NOT is_receiver THEN
      RAISE EXCEPTION 'Only the receiver can reject a challenge'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- seen -> cancelled (sender only)
  IF old_status = 'seen' AND new_status = 'cancelled' THEN
    IF NOT is_sender THEN
      RAISE EXCEPTION 'Only the sender can cancel a challenge'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- seen -> pending_verification (receiver only, e.g. self-roll dice)
  IF old_status = 'seen' AND new_status = 'pending_verification' THEN
    IF NOT is_receiver THEN
      RAISE EXCEPTION 'Only the receiver can report completion'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

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

CREATE TRIGGER guard_interaction_status_transition_trigger
  BEFORE UPDATE ON public.interactions
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_interaction_status_transition();
