
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'tos_accepted_at'
  ) THEN
    ALTER TABLE profiles ADD COLUMN tos_accepted_at timestamptz;
  END IF;
END $$;
