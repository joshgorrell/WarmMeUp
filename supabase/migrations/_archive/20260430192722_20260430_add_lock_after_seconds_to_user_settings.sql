/*
  # Add lock_after_seconds to user_settings

  ## Summary
  Adds a configurable re-lock timeout to each user's privacy settings.

  ## Changes
  ### Modified Tables
  - `user_settings`
    - `lock_after_seconds` (integer, nullable) — how many seconds the app can stay
      backgrounded before requiring the unlock gate again on resume.
      NULL means "lock immediately" (current default behaviour).

  ## Notes
  - No RLS changes required; existing policies already cover the user_settings table.
  - NULL is intentionally the default so existing users retain the current
    "always lock on background" behaviour until they choose a timeout.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_settings' AND column_name = 'lock_after_seconds'
  ) THEN
    ALTER TABLE user_settings ADD COLUMN lock_after_seconds integer DEFAULT NULL;
  END IF;
END $$;
