/*
  # Add couple_hidden_prompts table

  ## Overview
  Allows a couple to suppress (soft-delete) any default prompt from their
  personal view without affecting the global default rows that other couples
  depend on. When a couple "deletes" a default prompt, a row is inserted here.
  When a couple "edits" a default prompt, a suppression row is inserted here
  AND a new custom prompt row is inserted for the couple (their edited copy).

  ## New Tables
  - `couple_hidden_prompts`
    - `id` (uuid, primary key)
    - `couple_id` (uuid, FK → couples, NOT NULL)
    - `prompt_table` (text, NOT NULL) — one of: dice_prompts, dare_prompts,
      tell_me_prompts, note_templates
    - `prompt_id` (uuid, NOT NULL) — id of the original default prompt being hidden
    - `created_at` (timestamptz)
    - UNIQUE (couple_id, prompt_table, prompt_id) — prevents duplicate suppressions

  ## Security
  - RLS enabled; couples can only read/write their own suppressions
*/

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
