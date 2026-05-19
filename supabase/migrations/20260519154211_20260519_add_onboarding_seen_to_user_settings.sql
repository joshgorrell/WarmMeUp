/*
  # Add onboarding_seen to user_settings

  1. Changes
    - Add `onboarding_seen` boolean column (default false) to `user_settings`

  2. Purpose
    - Tracks whether a user has completed the onboarding carousel
    - Enables the first-launch onboarding flow to be shown exactly once
    - Allows pre-auth "preview" mode to remain stateless (no writes for unauthenticated users)

  3. Security
    - No new RLS policies needed; existing user_settings policies cover this column
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_settings' AND column_name = 'onboarding_seen'
  ) THEN
    ALTER TABLE user_settings ADD COLUMN onboarding_seen boolean NOT NULL DEFAULT false;
  END IF;
END $$;
