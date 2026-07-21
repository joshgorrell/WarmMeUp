
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'interactions' AND column_name = 'completion_requested_at'
  ) THEN
    ALTER TABLE interactions ADD COLUMN completion_requested_at timestamptz;
  END IF;
END $$;
