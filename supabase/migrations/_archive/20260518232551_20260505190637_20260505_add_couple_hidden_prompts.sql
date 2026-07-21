
CREATE TABLE IF NOT EXISTS couple_hidden_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id uuid NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  prompt_table text NOT NULL,
  prompt_id uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (couple_id, prompt_table, prompt_id)
);

ALTER TABLE couple_hidden_prompts ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS couple_hidden_prompts_couple_idx
  ON couple_hidden_prompts(couple_id, prompt_table);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Couple members can read own hidden prompts' AND tablename = 'couple_hidden_prompts') THEN
    CREATE POLICY "Couple members can read own hidden prompts"
      ON couple_hidden_prompts FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM couples
          WHERE id = couple_id
            AND (user_a_id = auth.uid() OR user_b_id = auth.uid())
        )
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Couple members can insert own hidden prompts' AND tablename = 'couple_hidden_prompts') THEN
    CREATE POLICY "Couple members can insert own hidden prompts"
      ON couple_hidden_prompts FOR INSERT
      TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM couples
          WHERE id = couple_id
            AND (user_a_id = auth.uid() OR user_b_id = auth.uid())
        )
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Couple members can delete own hidden prompts' AND tablename = 'couple_hidden_prompts') THEN
    CREATE POLICY "Couple members can delete own hidden prompts"
      ON couple_hidden_prompts FOR DELETE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM couples
          WHERE id = couple_id
            AND (user_a_id = auth.uid() OR user_b_id = auth.uid())
        )
      );
  END IF;
END $$;
