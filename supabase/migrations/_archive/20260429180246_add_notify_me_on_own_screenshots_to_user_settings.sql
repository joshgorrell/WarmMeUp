/*
  # Add notify_me_on_own_screenshots to user_settings

  ## Summary
  Adds a new personal preference column to user_settings that lets each user
  independently control whether they want a self-reminder when they take a
  screenshot of their partner's Vault content.

  ## Changes
  ### Modified Tables
  - `user_settings`
    - `notify_me_on_own_screenshots` (boolean, DEFAULT false): When enabled, the user
      receives an alert on their own device if they screenshot content uploaded by
      their partner. Entirely personal — each user controls this independently.

  ## Notes
  - Uses IF NOT EXISTS guard so re-running is safe.
  - No RLS changes needed; existing policies already restrict all user_settings
    access to the owning user (auth.uid() = user_id).
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_settings' AND column_name = 'notify_me_on_own_screenshots'
  ) THEN
    ALTER TABLE user_settings ADD COLUMN notify_me_on_own_screenshots boolean DEFAULT false;
  END IF;
END $$;
