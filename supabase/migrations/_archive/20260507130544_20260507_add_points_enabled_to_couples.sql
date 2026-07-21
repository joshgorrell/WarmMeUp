/*
  # Add points_enabled to couples

  ## Summary
  Adds a couple-level toggle to show or hide the points/score system in the app.

  ## Changes
  - `couples` table: new `points_enabled` boolean column (default true)
    - When true (default): scores, point tallies, and the Score tab are fully visible
    - When false: UI hides all point display but background tallying continues unaffected

  ## Notes
  - This is a couple-level setting — both partners share the same value
  - Existing couples get `true` by default (no behaviour change)
  - The existing RLS policies on `couples` already allow members to update their own record
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'couples' AND column_name = 'points_enabled'
  ) THEN
    ALTER TABLE couples ADD COLUMN points_enabled boolean NOT NULL DEFAULT true;
  END IF;
END $$;
