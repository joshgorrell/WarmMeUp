
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_settings' AND column_name = 'push_notifications_enabled'
  ) THEN
    ALTER TABLE user_settings ADD COLUMN push_notifications_enabled boolean DEFAULT false;
  END IF;
END $$;
