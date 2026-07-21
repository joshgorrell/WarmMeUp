
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_settings' AND column_name = 'notify_me_on_own_screenshots'
  ) THEN
    ALTER TABLE user_settings ADD COLUMN notify_me_on_own_screenshots boolean DEFAULT false;
  END IF;
END $$;
