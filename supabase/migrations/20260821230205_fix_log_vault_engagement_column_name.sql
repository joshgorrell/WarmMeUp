-- Fix log_vault_engagement trigger: it references NEW.user_id but vault_items has uploaded_by_user_id, not user_id
-- This caused every vault_items INSERT to fail with "column user_id does not exist", breaking auto-save from chat

CREATE OR REPLACE FUNCTION log_vault_engagement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO activity_events (couple_id, actor_user_id, target_user_id, event_type, source_screen)
  VALUES (NEW.couple_id, NEW.uploaded_by_user_id, NEW.uploaded_by_user_id, 'vault_uploaded', 'vault');

  RETURN NEW;
END;
$$;