/*
  # Add anniversary_date to couples table

  ## Summary
  Adds an optional `anniversary_date` column to the `couples` table so the
  Home screen can display "Time Together" (years/months since the date) and
  an anniversary countdown card.

  ## Modified Tables
  - `couples`
    - New column: `anniversary_date` (date, nullable)
      Set by either partner from the Account screen. Null means the feature
      is hidden.

  ## Security
  - No new policies needed. Existing couple-scoped UPDATE policies already
    allow either member of the couple to update couple fields.

  ## Notes
  1. Nullable — existing couples are unaffected.
  2. No data is modified; purely additive.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'couples' AND column_name = 'anniversary_date'
  ) THEN
    ALTER TABLE couples
      ADD COLUMN anniversary_date date;
  END IF;
END $$;
