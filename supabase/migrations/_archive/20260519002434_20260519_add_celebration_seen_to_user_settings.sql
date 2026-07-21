/*
  # Add celebration_seen to user_settings

  ## Summary
  Adds a boolean flag to user_settings so we can show the "You're paired!" celebration
  screen exactly once (when user A opens the app after their partner joins), then never
  again after they've dismissed it.

  ## Modified Tables
  - `user_settings`
    - `celebration_seen` (boolean, default false) — flipped to true after the user has
      seen the paired-celebration screen
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_settings' AND column_name = 'celebration_seen'
  ) THEN
    ALTER TABLE user_settings ADD COLUMN celebration_seen boolean NOT NULL DEFAULT false;
  END IF;
END $$;
