/*
  # Add dare completion tracking column

  ## Summary
  Adds a `completion_requested_at` timestamp to the `interactions` table so the
  receiver can self-report they completed a dare, triggering the sender's
  confirmation step before points are awarded.

  ## Changes
  - `interactions`: new nullable column `completion_requested_at` (timestamptz)
    — set when the receiver taps "I Did It!"
    — NULL means not yet self-reported
    — non-NULL means receiver has flagged completion; awaiting sender verify

  ## Notes
  - No RLS changes required; existing policies on `interactions` already allow
    the receiver to update rows they are party to.
  - Status flow: sent → accepted → pending_verification → completed
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'interactions' AND column_name = 'completion_requested_at'
  ) THEN
    ALTER TABLE interactions ADD COLUMN completion_requested_at timestamptz;
  END IF;
END $$;
