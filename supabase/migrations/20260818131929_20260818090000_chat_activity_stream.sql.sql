-- Surface meaningful Wish / Dare / Dice activity directly in the existing Chat timeline.
-- These rows are system-style chat entries: the sender is the partner who initiated the
-- feature action, while content_text contains a private WMU activity payload rendered by
-- MessageRow as a tappable activity card instead of a normal text bubble.
--
-- This deliberately uses chat_messages so chronology, pagination and realtime behavior
-- remain identical to normal Chat without a second timeline/query path.

CREATE OR REPLACE FUNCTION public.create_chat_activity_for_wish()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  payload text;
BEGIN
  -- Draft Wishes stay private to their creator until they are shared.
  IF NEW.status <> 'shared' THEN RETURN NEW; END IF;

  payload := '__WMU_ACTIVITY__:' || jsonb_build_object(
    'kind', 'wish',
    'sourceId', NEW.id,
    'title', NEW.title,
    'preview', NEW.description
  )::text;

  INSERT INTO chat_messages (couple_id, sender_id, content_text)
  SELECT NEW.couple_id, NEW.created_by_user_id, payload
  WHERE NOT EXISTS (
    SELECT 1
    FROM chat_messages m
    WHERE m.couple_id = NEW.couple_id
      AND m.sender_id = NEW.created_by_user_id
      AND m.deleted_at IS NULL
      AND m.content_text LIKE '__WMU_ACTIVITY__:%'
      AND m.content_text LIKE '%' || NEW.id::text || '%'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_chat_activity_wish ON wishes;
CREATE TRIGGER trg_chat_activity_wish
AFTER INSERT OR UPDATE OF status ON wishes
FOR EACH ROW EXECUTE FUNCTION public.create_chat_activity_for_wish();

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

DROP TRIGGER IF EXISTS trg_chat_activity_interaction ON interactions;
CREATE TRIGGER trg_chat_activity_interaction
AFTER INSERT ON interactions
FOR EACH ROW EXECUTE FUNCTION public.create_chat_activity_for_interaction();