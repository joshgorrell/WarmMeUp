
CREATE TABLE IF NOT EXISTS reports (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body         text NOT NULL,
  status       text NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'reviewed', 'resolved')),
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can submit their own reports' AND tablename = 'reports') THEN
    CREATE POLICY "Users can submit their own reports"
      ON reports FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = reporter_id);
  END IF;
END $$;
