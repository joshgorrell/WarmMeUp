/*
  # Add answer fields to interactions table

  1. Changes
    - `interactions` table gets two new columns:
      - `answer_text` (text, nullable) — stores the partner's text reply separately from the question
      - `answered_at` (timestamptz, nullable) — timestamp when the interaction was answered
    - These replace the previous pattern of concatenating the answer into `content_text`

  2. Notes
    - Existing rows are unaffected; both columns default to NULL
    - No data migration needed — old concatenated rows are historical and still readable
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'interactions' AND column_name = 'answer_text'
  ) THEN
    ALTER TABLE interactions ADD COLUMN answer_text text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'interactions' AND column_name = 'answered_at'
  ) THEN
    ALTER TABLE interactions ADD COLUMN answered_at timestamptz;
  END IF;
END $$;
