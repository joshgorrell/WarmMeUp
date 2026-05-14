/*
  # Add login_method to user_settings

  ## Summary
  Adds a `login_method` column to the `user_settings` table to store
  the user's preferred app unlock method.

  ## Changes
  - `user_settings.login_method` (text, NOT NULL, default 'pin')
    - Allowed values: 'password', 'pin', 'biometric'
    - Existing rows default to 'pin' (the recommended middle-ground)

  ## Notes
  - No RLS changes needed — existing policies already cover the full row
  - The old `face_id_required` column is kept intact for vault-level protection;
    `login_method` is the app-open gate preference
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_settings' AND column_name = 'login_method'
  ) THEN
    ALTER TABLE user_settings
      ADD COLUMN login_method text NOT NULL DEFAULT 'pin'
      CHECK (login_method IN ('password', 'pin', 'biometric'));
  END IF;
END $$;
