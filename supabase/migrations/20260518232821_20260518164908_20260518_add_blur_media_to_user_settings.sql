
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_settings' AND column_name = 'blur_media'
  ) THEN
    ALTER TABLE user_settings ADD COLUMN blur_media boolean DEFAULT true;
  END IF;
END $$;
