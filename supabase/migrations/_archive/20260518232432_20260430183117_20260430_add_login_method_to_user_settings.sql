
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_settings' AND column_name = 'login_method'
  ) THEN
    ALTER TABLE user_settings
      ADD COLUMN login_method text NOT NULL DEFAULT 'pin'
      CHECK (login_method IN ('password', 'pin', 'biometric'));
  END IF;
END $$;
