
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_settings' AND column_name = 'challenge_expiry_hours'
  ) THEN
    ALTER TABLE user_settings
      ADD COLUMN challenge_expiry_hours integer NOT NULL DEFAULT 24;
  END IF;
END $$;
