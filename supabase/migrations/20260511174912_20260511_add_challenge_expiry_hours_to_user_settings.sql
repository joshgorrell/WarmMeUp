/*
  # Add challenge_expiry_hours to user_settings

  ## Summary
  Adds a configurable expiry window for Dare and Dice challenges sent by each user.

  ## Changes

  ### Modified Tables
  - `user_settings`
    - New column: `challenge_expiry_hours` (integer, NOT NULL, DEFAULT 24)
      - Controls how long a Dare or Dice challenge the user sends will remain active
      - Valid values: 1, 4, 12, 24 (enforced in the app UI, not at the DB level)
      - Default of 24 hours matches the original plan and is applied to all existing rows

  ## Notes
  1. No RLS changes required — existing policies already cover SELECT/UPDATE for own row.
  2. The column default ensures existing user_settings rows and the auto-create trigger
     for new signups both receive 24 hours without any backfill step.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_settings' AND column_name = 'challenge_expiry_hours'
  ) THEN
    ALTER TABLE user_settings
      ADD COLUMN challenge_expiry_hours integer NOT NULL DEFAULT 24;
  END IF;
END $$;
