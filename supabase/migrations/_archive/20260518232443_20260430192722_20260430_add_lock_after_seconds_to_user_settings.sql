
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_settings' AND column_name = 'lock_after_seconds'
  ) THEN
    ALTER TABLE user_settings ADD COLUMN lock_after_seconds integer DEFAULT NULL;
  END IF;
END $$;
