
DROP POLICY IF EXISTS "Anon can lookup couple by exact invite code" ON couples;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Anon can lookup couple by invite code for joining' AND tablename = 'couples') THEN
    CREATE POLICY "Anon can lookup couple by invite code for joining"
      ON couples FOR SELECT
      TO anon
      USING (invite_code IS NOT NULL);
  END IF;
END $$;
