/*
  # Add push_notifications_enabled to user_settings

  1. Changes
    - `user_settings`: adds `push_notifications_enabled` (boolean, default false)
      - false by default so users explicitly opt in
      - Controls whether the app registers for push tokens and the partner receives notifications
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_settings' AND column_name = 'push_notifications_enabled'
  ) THEN
    ALTER TABLE user_settings ADD COLUMN push_notifications_enabled boolean DEFAULT false;
  END IF;
END $$;
