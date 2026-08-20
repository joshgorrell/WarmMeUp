/*
# Hide self-rolled dice from the Chat timeline

## Summary
When a user rolls the dice "For Me" (rolled_for = 'self'), that roll currently
creates a tappable activity card in the couple's Chat timeline — the same card
that is created when rolling "For My Partner". Self-rolls are private to the
roller and should not appear in Chat. Only partner rolls (rolled_for = 'partner')
should produce a chat activity card.

## Changes
1. Modifies the `create_chat_activity_for_interaction()` trigger function so it
   returns early (no chat_messages insert) when the interaction is a dice roll
   with `rolled_for = 'self'`.
2. Dares are unaffected (they are always sent to a partner).
3. Partner dice rolls are unaffected.
4. Cleans up existing chat activity rows that were created by self-rolls so
   they no longer appear in Chat. This soft-deletes (sets deleted_at) only the
   chat_messages activity rows whose source interaction is a dice row with
   rolled_for = 'self'. No real messages or partner activity cards are touched.

## Security
No RLS or policy changes. The trigger function remains SECURITY DEFINER with
search_path pinned to public.
*/

-- 1. Recreate the trigger function with the self-roll guard
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

  -- Self-rolled dice are private to the roller; do not surface in Chat.
  IF NEW.type = 'dice' AND NEW.rolled_for = 'self' THEN RETURN NEW; END IF;

  fallback_title := CASE
    WHEN NEW.type = 'dare' THEN 'A new Dare is waiting for you.'
    ELSE 'A new Dice roll is waiting for you.'
  END;

  payload := '__WMU_ACTIVITY__:' || jsonb_build_object(
    'kind', NEW.type,
    'sourceId', NEW.id,
    'title', COALESCE(NULLIF(NEW.content_text, ''), fallback_title),
    'preview', NULL
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

-- 2. Soft-delete existing chat activity cards that came from self-rolled dice.
--    We parse the sourceId out of the activity payload and join to interactions
--    to find rows where type = 'dice' AND rolled_for = 'self'.
UPDATE chat_messages m
SET deleted_at = COALESCE(m.deleted_at, now())
WHERE m.deleted_at IS NULL
  AND m.content_text LIKE '__WMU_ACTIVITY__:%'
  AND EXISTS (
    SELECT 1
    FROM interactions i
    WHERE i.type = 'dice'
      AND i.rolled_for = 'self'
      AND m.content_text LIKE '%' || i.id::text || '%'
      AND m.couple_id = i.couple_id
  );
