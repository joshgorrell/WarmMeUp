
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'couples' AND column_name = 'points_enabled'
  ) THEN
    ALTER TABLE couples ADD COLUMN points_enabled boolean NOT NULL DEFAULT true;
  END IF;
END $$;
