
CREATE TABLE IF NOT EXISTS point_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text UNIQUE NOT NULL,
  label text NOT NULL,
  points integer NOT NULL DEFAULT 0,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE point_config ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated users can read point config' AND tablename = 'point_config') THEN
    CREATE POLICY "Authenticated users can read point config"
      ON point_config FOR SELECT
      TO authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admins can update point config' AND tablename = 'point_config') THEN
    CREATE POLICY "Admins can update point config"
      ON point_config FOR UPDATE
      TO authenticated
      USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
      )
      WITH CHECK (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admins can insert point config' AND tablename = 'point_config') THEN
    CREATE POLICY "Admins can insert point config"
      ON point_config FOR INSERT
      TO authenticated
      WITH CHECK (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
      );
  END IF;
END $$;

INSERT INTO point_config (event_key, label, points) VALUES
  ('dare_accept',    'Dare — Accept',               5),
  ('dare_complete',  'Dare — Complete (bonus)',     25),
  ('dice_accept',    'Dice — Accept',               5),
  ('dice_complete',  'Dice — Complete (bonus)',     25),
  ('ask_sent',       'Ask — Question sent',         5),
  ('ask_replied',    'Ask — Reply received',       10),
  ('chat_message',   'Chat — Message sent',         1),
  ('chat_media',     'Chat — Photo or Video sent', 10),
  ('vault_upload',   'Vault — Upload',             10)
ON CONFLICT (event_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id uuid NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content_text text,
  media_storage_path text,
  media_storage_bucket text,
  media_type text CHECK (media_type IN ('photo', 'video')),
  allow_screenshot boolean NOT NULL DEFAULT false,
  allow_save boolean NOT NULL DEFAULT false,
  allow_share boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_chat_messages_couple ON chat_messages(couple_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_couple_created ON chat_messages(couple_id, created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Couple members can read chat messages' AND tablename = 'chat_messages') THEN
    CREATE POLICY "Couple members can read chat messages"
      ON chat_messages FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM couples
          WHERE id = chat_messages.couple_id
            AND (user_a_id = auth.uid() OR user_b_id = auth.uid())
        )
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Couple members can send chat messages' AND tablename = 'chat_messages') THEN
    CREATE POLICY "Couple members can send chat messages"
      ON chat_messages FOR INSERT
      TO authenticated
      WITH CHECK (
        sender_id = auth.uid()
        AND EXISTS (
          SELECT 1 FROM couples
          WHERE id = chat_messages.couple_id
            AND (user_a_id = auth.uid() OR user_b_id = auth.uid())
        )
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Senders can delete their own messages' AND tablename = 'chat_messages') THEN
    CREATE POLICY "Senders can delete their own messages"
      ON chat_messages FOR DELETE
      TO authenticated
      USING (sender_id = auth.uid());
  END IF;
END $$;

ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;

CREATE TABLE IF NOT EXISTS monthly_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id uuid NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  year integer NOT NULL,
  month integer NOT NULL CHECK (month BETWEEN 1 AND 12),
  points integer NOT NULL DEFAULT 0,
  dares_accepted integer NOT NULL DEFAULT 0,
  dares_completed integer NOT NULL DEFAULT 0,
  dares_skipped integer NOT NULL DEFAULT 0,
  dice_accepted integer NOT NULL DEFAULT 0,
  dice_completed integer NOT NULL DEFAULT 0,
  dice_skipped integer NOT NULL DEFAULT 0,
  asks_sent integer NOT NULL DEFAULT 0,
  asks_replied integer NOT NULL DEFAULT 0,
  chat_messages_sent integer NOT NULL DEFAULT 0,
  media_sent integer NOT NULL DEFAULT 0,
  vault_uploads integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(couple_id, user_id, year, month)
);

ALTER TABLE monthly_scores ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_monthly_scores_couple_user ON monthly_scores(couple_id, user_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Couple members can read monthly scores' AND tablename = 'monthly_scores') THEN
    CREATE POLICY "Couple members can read monthly scores"
      ON monthly_scores FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM couples
          WHERE id = monthly_scores.couple_id
            AND (user_a_id = auth.uid() OR user_b_id = auth.uid())
        )
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'System can upsert monthly scores' AND tablename = 'monthly_scores') THEN
    CREATE POLICY "System can upsert monthly scores"
      ON monthly_scores FOR INSERT
      TO authenticated
      WITH CHECK (
        user_id = auth.uid()
        AND EXISTS (
          SELECT 1 FROM couples
          WHERE id = monthly_scores.couple_id
            AND (user_a_id = auth.uid() OR user_b_id = auth.uid())
        )
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'System can update monthly scores' AND tablename = 'monthly_scores') THEN
    CREATE POLICY "System can update monthly scores"
      ON monthly_scores FOR UPDATE
      TO authenticated
      USING (
        user_id = auth.uid()
        AND EXISTS (
          SELECT 1 FROM couples
          WHERE id = monthly_scores.couple_id
            AND (user_a_id = auth.uid() OR user_b_id = auth.uid())
        )
      )
      WITH CHECK (
        user_id = auth.uid()
        AND EXISTS (
          SELECT 1 FROM couples
          WHERE id = monthly_scores.couple_id
            AND (user_a_id = auth.uid() OR user_b_id = auth.uid())
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'interactions' AND column_name = 'completed_at'
  ) THEN
    ALTER TABLE interactions ADD COLUMN completed_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'interactions' AND column_name = 'completed_verified_by'
  ) THEN
    ALTER TABLE interactions ADD COLUMN completed_verified_by uuid REFERENCES auth.users(id);
  END IF;
END $$;
