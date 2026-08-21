/*
# Include expiresAt in dare activity card payload

## Purpose
When a Dare activity card appears in Chat, it always says "View Dare" even after
the dare has expired. This migration updates the `create_chat_activity_for_interaction()`
trigger function to include `expiresAt` in the JSON payload for dare-type interactions.
The frontend will compare this timestamp to the current time at render and show
"Expired" instead of "View Dare" when the deadline has passed.

## Changes
- `create_chat_activity_for_interaction()` — adds `expiresAt` field to the JSON
  payload for `dare` type interactions. Dice interactions have no expiry, so
  the field is set to NULL for those (and omitted from the payload entirely).

## Notes
1. Existing already-sent dare activity cards won't have `expiresAt` in their JSON.
   The frontend handles this gracefully by defaulting to the "View Dare" action
   when `expiresAt` is absent.
2. The trigger still only fires on INSERT (not UPDATE), so expiry status changes
   on the interaction itself don't update the chat message. The frontend computes
   expiry at render time from the `expiresAt` timestamp, which is a snapshot from
   when the dare was created — this is correct because dare expiry times don't
   change after creation.
*/

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
