-- Fix log_wish_engagement trigger: it references NEW.user_id but wishes has created_by_user_id, not user_id
-- Same class of bug as log_vault_engagement

CREATE OR REPLACE FUNCTION log_wish_engagement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO activity_events (couple_id, actor_user_id, target_user_id, event_type, source_screen)
  VALUES (NEW.couple_id, NEW.created_by_user_id, NEW.created_by_user_id, 'wish_created', 'wish');

  RETURN NEW;
END;
$$;