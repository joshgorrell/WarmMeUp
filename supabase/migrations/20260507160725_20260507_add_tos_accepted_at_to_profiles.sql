/*
  # Add ToS acceptance timestamp to profiles

  1. Modified Tables
    - `profiles`
      - `tos_accepted_at` (timestamptz, nullable) — records the exact moment a user
        accepted the Terms of Service during signup. Null for legacy accounts that
        pre-date this requirement. Used for legal record-keeping and compliance.

  2. Notes
    - Column is nullable so existing accounts are not broken
    - Application code sets this at the moment of account creation, not via a trigger,
      so it captures the user's explicit acceptance action
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'tos_accepted_at'
  ) THEN
    ALTER TABLE profiles ADD COLUMN tos_accepted_at timestamptz;
  END IF;
END $$;
