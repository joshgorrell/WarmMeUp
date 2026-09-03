/*
# Dice Accept Is the Final Action

## Purpose
Simplifies the Dice workflow so that accepting a Dice challenge is the final
successful outcome — identical to how Dares now work. Previously the flow was:
sent -> seen -> accepted -> pending_verification -> completed (with sender
confirmation). Now it is: sent -> seen -> accepted (terminal, moves to history
immediately). This matches the Dare simplification from migration
20260903160000_dare_accept_is_final.sql.

## Changes

### 1. State Machine Guard — block accepted -> pending_verification for dice
The `guard_interaction_status_transition()` trigger function is updated so
that the `accepted -> pending_verification` transition is blocked for BOTH
`type = 'dare'` AND `type = 'dice'`. The guard trigger is temporarily dropped
to allow bulk data recovery, then recreated.

### 2. Expire functions — exclude accepted dice
`expire_overdue_dares()` and `expire_dares_trigger_fn()` already only match
`status IN ('sent', 'seen')`, so accepted dice are already excluded. No
change needed — these functions are type-agnostic and already safe.

### 3. Bulk data recovery
a) Convert all existing dice rows in `pending_verification` to `accepted`
   with `completed_at = now()`, `is_active = false`.
b) Recover expired dice that already received a "Dice challenge accepted"
   point event: set them back to `accepted` with `completed_at` populated,
   `is_active = false`.

### 4. Point config — combine acceptance + completion into dice_accept
Update `point_config` table rows: set `dice_accept` to 30 and `dice_complete`
to 0.

## Tables affected
- `interactions` — state machine guard update, bulk data updates
- `point_config` — dice_accept = 30, dice_complete = 0

## Security
- No RLS policy changes.
- State machine guard remains SECURITY DEFINER with pinned search_path.

## Notes
1. The `accepted` status for dice is now terminal (like `completed`).
2. Accepted dice never expire — they persist in history indefinitely.
3. Both Dare and Dice now have the same simplified flow: accept is final.
4. The guard trigger is dropped before bulk updates and recreated after,
   so the data recovery is not blocked by the state machine.
*/

-- Step 1: Drop the guard trigger temporarily so bulk updates are not blocked
DROP TRIGGER IF EXISTS guard_interaction_status_transition_trigger ON public.interactions;

-- Step 2: Update the guard function to block dice accepted -> pending_verification
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

  -- Time-based expiry: sent/seen -> expired (no ownership check)
  -- Accepted dares/dice are NOT expired (they are terminal).
  IF new_status = 'expired'
     AND old_status IN ('sent', 'seen')
  THEN
    RETURN NEW;
  END IF;

  IF old_status = 'sent' AND new_status = 'seen' THEN
    IF NOT is_receiver THEN
      RAISE EXCEPTION 'Only the receiver can mark a challenge as seen'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF old_status = 'seen' AND new_status = 'accepted' THEN
    IF NOT is_receiver THEN
      RAISE EXCEPTION 'Only the receiver can accept a challenge'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF old_status = 'seen' AND new_status = 'rejected' THEN
    IF NOT is_receiver THEN
      RAISE EXCEPTION 'Only the receiver can reject a challenge'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF old_status = 'seen' AND new_status = 'cancelled' THEN
    IF NOT is_sender THEN
      RAISE EXCEPTION 'Only the sender can cancel a challenge'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- seen -> pending_verification: no longer allowed for dice or dare
  IF old_status = 'seen' AND new_status = 'pending_verification' THEN
    RAISE EXCEPTION 'Completion reporting is no longer supported'
      USING ERRCODE = '44000';
  END IF;

  IF old_status = 'sent' AND new_status = 'accepted' THEN
    IF NOT is_receiver THEN
      RAISE EXCEPTION 'Only the receiver can accept a challenge'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF old_status = 'sent' AND new_status = 'rejected' THEN
    IF NOT is_receiver THEN
      RAISE EXCEPTION 'Only the receiver can reject a challenge'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF old_status = 'sent' AND new_status = 'cancelled' THEN
    IF NOT is_sender THEN
      RAISE EXCEPTION 'Only the sender can cancel a challenge'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- accepted -> pending_verification: blocked for BOTH dice and dare
  IF old_status = 'accepted' AND new_status = 'pending_verification' THEN
    RAISE EXCEPTION 'Challenges cannot transition to pending verification after acceptance'
      USING ERRCODE = '44000';
  END IF;

  IF old_status = 'accepted' AND new_status = 'rejected' THEN
    IF NOT is_receiver THEN
      RAISE EXCEPTION 'Only the receiver can reject a challenge'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF old_status = 'pending_verification' AND new_status = 'completed' THEN
    IF NOT is_sender THEN
      RAISE EXCEPTION 'Only the sender can verify completion'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF old_status = 'pending_verification' AND new_status = 'rejected' THEN
    IF NOT is_sender THEN
      RAISE EXCEPTION 'Only the sender can reject a pending verification'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Invalid status transition from % to %', old_status, new_status
    USING ERRCODE = '44000';
END;
$$;

-- Step 3: Bulk data recovery (guard trigger is off, so these updates succeed)

-- 3a. Convert existing pending_verification dice to accepted
UPDATE interactions
SET status = 'accepted',
    is_active = false,
    completed_at = COALESCE(completed_at, now())
WHERE type = 'dice'
  AND status = 'pending_verification'
  AND deleted_at IS NULL;

-- 3b. Recover expired dice that already received a "Dice challenge accepted" point event
UPDATE interactions i
SET status = 'accepted',
    is_active = false,
    completed_at = COALESCE(i.completed_at, i.expires_at, i.created_at)
FROM point_events pe
WHERE i.type = 'dice'
  AND i.status = 'expired'
  AND i.deleted_at IS NULL
  AND pe.interaction_id = i.id
  AND pe.reason = 'Dice challenge accepted';

-- Step 4: Recreate the guard trigger
CREATE TRIGGER guard_interaction_status_transition_trigger
  BEFORE UPDATE ON public.interactions
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_interaction_status_transition();

-- Step 5: Update point_config for dice
INSERT INTO point_config (event_key, label, points)
VALUES ('dice_accept', 'Dice accepted', 30)
ON CONFLICT (event_key) DO UPDATE SET points = 30;

INSERT INTO point_config (event_key, label, points)
VALUES ('dice_complete', 'Dice completed', 0)
ON CONFLICT (event_key) DO UPDATE SET points = 0;