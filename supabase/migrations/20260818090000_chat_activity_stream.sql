-- Add partner-facing Wish / Dare / Dice events to the Chat stream without
-- duplicating them into chat_messages. Chat reads these events alongside
-- normal messages and deep-links back to the source feature.

CREATE OR REPLACE FUNCTION public.create_chat_activity_for_wish()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  partner_id uuid;
BEGIN
  SELECT CASE WHEN c.user_a_id = NEW.created_by_user_id THEN c.user_b_id ELSE c.user_a_id END
    INTO partner_id
  FROM couples c WHERE c.id = NEW.couple_id;
  IF partner_id IS NULL THEN RETURN NEW; END IF;

  INSERT INTO activity_events (couple_id, actor_user_id, target_user_id, event_type, wish_id, metadata, source_screen)
  SELECT NEW.couple_id, NEW.created_by_user_id, partner_id, 'chat_wish', NEW.id,
         jsonb_build_object('title', NEW.title, 'description', NEW.description), 'wish'
  WHERE NOT EXISTS (
    SELECT 1 FROM activity_events e
    WHERE e.couple_id = NEW.couple_id AND e.actor_user_id = NEW.created_by_user_id
      AND e.event_type = 'chat_wish' AND e.wish_id = NEW.id
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_chat_activity_wish ON wishes;
CREATE TRIGGER trg_chat_activity_wish
AFTER INSERT ON wishes
FOR EACH ROW EXECUTE FUNCTION public.create_chat_activity_for_wish();

CREATE OR REPLACE FUNCTION public.create_chat_activity_for_interaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  event_name text;
BEGIN
  IF NEW.type NOT IN ('dare', 'dice') THEN RETURN NEW; END IF;
  event_name := CASE WHEN NEW.type = 'dare' THEN 'chat_dare' ELSE 'chat_dice' END;

  INSERT INTO activity_events (couple_id, actor_user_id, target_user_id, event_type, metadata, source_screen)
  SELECT NEW.couple_id, NEW.sender_id, NEW.receiver_id, event_name,
         jsonb_build_object(
           'interaction_id', NEW.id,
           'content_text', NEW.content_text,
           'prompt_id', NEW.prompt_id,
           'mode', NEW.mode,
           'rolled_for', NEW.rolled_for
         ), NEW.type
  WHERE NOT EXISTS (
    SELECT 1 FROM activity_events e
    WHERE e.couple_id = NEW.couple_id AND e.actor_user_id = NEW.sender_id
      AND e.event_type = event_name AND e.metadata->>'interaction_id' = NEW.id::text
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_chat_activity_interaction ON interactions;
CREATE TRIGGER trg_chat_activity_interaction
AFTER INSERT ON interactions
FOR EACH ROW EXECUTE FUNCTION public.create_chat_activity_for_interaction();

-- Existing activity_events RLS already limits reads to members of the couple.
-- Add the new event types to realtime publication if the table is already published
-- by leaving publication configuration unchanged; the Chat client also refreshes on focus.
