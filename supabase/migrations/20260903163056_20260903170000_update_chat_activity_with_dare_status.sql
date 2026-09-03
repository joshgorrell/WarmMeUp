/*
# Update Chat Activity Payload with Dare Status

When a dare's status changes (e.g. accepted, rejected, expired), update the
corresponding chat activity message's payload to include the current status.
This lets the chat card render correctly (e.g. show "Accepted" for accepted
dares instead of hiding them when the deadline passes).

## Changes
- New function `update_chat_activity_status()` that fires AFTER UPDATE on
  interactions. When the status changes, it finds the corresponding chat
  message and updates the JSON payload to include `dareStatus`.
- New trigger `trg_chat_activity_status_update` on interactions.

## Notes
- Only fires for dare and dice types (same as the insert trigger).
- Uses a regex-free approach: finds the chat message by sourceId, parses
  the JSON payload, adds dareStatus, and updates.
- If no chat message exists (e.g. older dare), does nothing.
*/

CREATE OR REPLACE FUNCTION public.update_chat_activity_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  msg_id uuid;
  old_payload text;
  new_payload text;
  payload_json jsonb;
BEGIN
  -- Only process dare and dice, and only when status actually changed
  IF NEW.type NOT IN ('dare', 'dice') THEN RETURN NEW; END IF;
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;

  -- Find the chat activity message for this interaction
  SELECT id, content_text INTO msg_id, old_payload
  FROM chat_messages
  WHERE content_text LIKE '__WMU_ACTIVITY__:%'
    AND content_text LIKE '%' || NEW.id::text || '%'
    AND deleted_at IS NULL
  ORDER BY created_at ASC
  LIMIT 1;

  IF msg_id IS NULL THEN RETURN NEW; END IF;

  -- Parse the existing payload, add dareStatus, and update
  BEGIN
    payload_json := (old_payload LIKE '__WMU_ACTIVITY__:%')::text
      ? NULL;
    payload_json := substring(old_payload from '__WMU_ACTIVITY__:(.*)$')::jsonb;
  EXCEPTION WHEN OTHERS THEN
    RETURN NEW;
  END;

  payload_json := payload_json || jsonb_build_object('dareStatus', NEW.status);
  new_payload := '__WMU_ACTIVITY__:' || payload_json::text;

  UPDATE chat_messages
  SET content_text = new_payload
  WHERE id = msg_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_chat_activity_status_update ON interactions;
CREATE TRIGGER trg_chat_activity_status_update
  AFTER UPDATE OF status ON interactions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_chat_activity_status();
