/*
# Dare Accept Is the Final Action

## Purpose
Simplifies the Dare workflow so that accepting a Dare is the final successful
outcome. Previously the flow was: sent -> seen -> accepted -> pending_verification
-> completed (with sender confirmation). Now it is: sent -> seen -> accepted
(terminal, moves to history immediately). The Dice workflow is completely
unchanged.

## Changes

### 1. State Machine Guard — block accepted -> pending_verification for dares
The `guard_interaction_status_transition()` trigger function is updated so
that the `accepted -> pending_verification` transition is only allowed for
`type = 'dice'`, not for `type = 'dare'`. Dice keeps its full
accept -> verify -> complete flow. The guard trigger is temporarily dropped
to allow bulk data recovery, then recreated.

### 2. Expire functions — exclude accepted dares
`expire_overdue_dares()` and `expire_dares_trigger_fn()` are updated so
accepted dares are never expired. Only `sent` and `seen` dares with a lapsed
`expires_at` are expired.

### 3. Bulk data recovery
a) Convert all existing dare rows in `pending_verification` to `accepted`
   with `completed_at = now()`, `is_active = false`.
b) Recover expired dares that already received a "Dare accepted" point event:
   set them back to `accepted` with `completed_at` populated, `is_active = false`.

### 4. Point config — combine acceptance + completion into dare_accept
Update `point_config` table rows: set `dare_accept` to 30 and `dare_complete` to 0.

### 5. Chat activity trigger — include expiresAt in payload
The `create_chat_activity_for_interaction()` trigger is updated to include
`expiresAt` in the activity payload for dares and dice, so the chat card can
decide visibility based on the dare's status.

## Tables affected
- `interactions` — state machine guard, expiry trigger, bulk data updates
- `point_config` — dare_accept = 30, dare_complete = 0
- `chat_messages` — activity trigger payload updated

## Security
- No RLS policy changes.
- State machine guard remains SECURITY DEFINER with pinned search_path.
- Expiry functions remain SECURITY DEFINER with pinned search_path.

## Notes
1. The `accepted` status for dares is now terminal (like `completed`).
2. Accepted dares never expire — they persist in history indefinitely.
3. The Dice workflow is completely unchanged.
4. The guard trigger is dropped before bulk updates and recreated after,
   so the data recovery is not blocked by the state machine.
*/

-- Step 1: Drop the guard trigger temporarily so bulk updates are not blocked
DROP TRIGGER IF EXISTS guard_interaction_status_transition_trigger ON public.interactions;

-- Step 2: Update the guard function (will be re-attached after bulk updates)
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
  -- Accepted dares are NOT expired (they are terminal for dares).
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

  -- seen -> pending_verification: only for dice (receiver only)
  IF old_status = 'seen' AND new_status = 'pending_verification' THEN
    IF NOT is_receiver THEN
      RAISE EXCEPTION 'Only the receiver can report completion'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
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

  -- accepted -> pending_verification: ONLY for dice, NOT for dares
  IF old_status = 'accepted' AND new_status = 'pending_verification' THEN
    IF OLD.type = 'dare' THEN
      RAISE EXCEPTION 'Dares cannot transition to pending verification after acceptance'
        USING ERRCODE = '44000';
    END IF;
    IF NOT is_receiver THEN
      RAISE EXCEPTION 'Only the receiver can report completion'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
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

-- 3a. Convert existing pending_verification dares to accepted
UPDATE interactions
SET status = 'accepted',
    is_active = false,
    completed_at = COALESCE(completed_at, now())
WHERE type = 'dare'
  AND status = 'pending_verification'
  AND deleted_at IS NULL;

-- 3b. Recover expired dares that already received a "Dare accepted" point event
UPDATE interactions i
SET status = 'accepted',
    is_active = false,
    completed_at = COALESCE(i.completed_at, i.expires_at, i.created_at)
FROM point_events pe
WHERE i.type = 'dare'
  AND i.status = 'expired'
  AND i.deleted_at IS NULL
  AND pe.interaction_id = i.id
  AND pe.reason = 'Dare accepted';

-- Step 4: Recreate the guard trigger
CREATE TRIGGER guard_interaction_status_transition_trigger
  BEFORE UPDATE ON public.interactions
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_interaction_status_transition();

-- Step 5: Update expire functions to exclude accepted dares
CREATE OR REPLACE FUNCTION public.expire_overdue_dares()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE interactions
  SET status = 'expired',
      is_active = false
  WHERE type = 'dare'
    AND deleted_at IS NULL
    AND expires_at IS NOT NULL
    AND expires_at < now()
    AND status IN ('sent', 'seen');
END;
$$;

GRANT EXECUTE ON FUNCTION public.expire_overdue_dares() TO authenticated;

CREATE OR REPLACE FUNCTION public.expire_dares_trigger_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.type = 'dare'
     AND NEW.deleted_at IS NULL
     AND NEW.expires_at IS NOT NULL
     AND NEW.expires_at < now()
     AND NEW.status IN ('sent', 'seen')
  THEN
    NEW.status := 'expired';
    NEW.is_active := false;
  END IF;
  RETURN NEW;
END;
$$;

-- Step 6: Update point_config
INSERT INTO point_config (event_key, label, points)
VALUES ('dare_accept', 'Dare accepted', 30)
ON CONFLICT (event_key) DO UPDATE SET points = 30;

INSERT INTO point_config (event_key, label, points)
VALUES ('dare_complete', 'Dare completed', 0)
ON CONFLICT (event_key) DO UPDATE SET points = 0;

-- Step 7: Update chat activity trigger to include expiresAt
CREATE OR REPLACE FUNCTION public.create_chat_activity_for_interaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  payload text;
  fallback_title text;
BEGIN
  IF NEW.type NOT IN ('dare', 'dice') THEN RETURN NEW; END IF;

  fallback_title := CASE
    WHEN NEW.type = 'dare' THEN 'A new Dare is waiting for you.'
    ELSE 'A new Dice roll is waiting for you.'
  END;

  payload := '__WMU_ACTIVITY__:' || jsonb_build_object(
    'kind', NEW.type,
    'sourceId', NEW.id,
    'title', COALESCE(NULLIF(NEW.content_text, ''), fallback_title),
    'preview', NULL,
    'expiresAt', NEW.expires_at
  )::text;

  INSERT INTO chat_messages (couple_id, sender_id, content_text)
  SELECT NEW.couple_id, NEW.sender_id, payload
  WHERE NOT EXISTS (
    SELECT 1
    FROM chat_messages m
    WHERE m.couple_id = NEW.couple_id
      AND m.sender_id = NEW.sender_id
      AND m.deleted_at IS NULL
      AND m.content_text LIKE '__WMU_ACTIVITY__:%'
      AND m.content_text LIKE '%' || NEW.id::text || '%'
  );

  RETURN NEW;
END;
$$;