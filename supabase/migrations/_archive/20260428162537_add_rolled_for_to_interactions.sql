/*
  # Add rolled_for to interactions

  Adds a `rolled_for` column to the `interactions` table to distinguish
  whether a dice roll was intended for the roller themselves ('self') or
  sent as a challenge to their partner ('partner').

  1. Modified Tables
    - `interactions`
      - `rolled_for` (text, nullable) — 'self' | 'partner' | null
        null means the interaction pre-dates this column (treat as 'self')

  2. Notes
    - Nullable intentionally so existing rows are unaffected
    - No RLS changes needed; existing policies cover this column
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'interactions' AND column_name = 'rolled_for'
  ) THEN
    ALTER TABLE interactions ADD COLUMN rolled_for text;
  END IF;
END $$;
