/*
  # Add soft-delete support to interactions table

  ## Summary
  Adds a `deleted_at` column to `interactions` so rows can be soft-deleted
  instead of permanently removed. Deleted rows are excluded from all active
  queries by filtering `WHERE deleted_at IS NULL`.

  ## Changes

  ### Modified Tables
  - `interactions`
    - `deleted_at` (timestamptz, nullable, default NULL) — set when a row is
      soft-deleted; NULL means the row is live

  ## New Indexes
  - Partial index on `(couple_id, type, status)` filtered to `deleted_at IS NULL`
    for efficient lookup of live interactions

  ## Security
  - New UPDATE policy: users may soft-delete their own sent interactions
    (rows where `sender_id = auth.uid()`) by setting `deleted_at`.

  ## Notes
  1. No data is destroyed — the row and its point_events ledger entries remain.
  2. Point reversal is handled in application code via reversePoints().
  3. The existing `is_active` flag is also set to false at the same time as
     deleted_at so legacy queries filtering on is_active stop showing the row.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'interactions' AND column_name = 'deleted_at'
  ) THEN
    ALTER TABLE interactions ADD COLUMN deleted_at timestamptz DEFAULT NULL;
  END IF;
END $$;

-- Partial index for fast live-interaction lookups
CREATE INDEX IF NOT EXISTS idx_interactions_live_couple
  ON interactions (couple_id, type, status)
  WHERE deleted_at IS NULL;

-- Policy: sender can soft-delete their own interaction
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'interactions'
      AND policyname = 'Sender can soft-delete own interaction'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "Sender can soft-delete own interaction"
        ON interactions
        FOR UPDATE
        TO authenticated
        USING (auth.uid() = sender_id)
        WITH CHECK (auth.uid() = sender_id)
    $p$;
  END IF;
END $$;
