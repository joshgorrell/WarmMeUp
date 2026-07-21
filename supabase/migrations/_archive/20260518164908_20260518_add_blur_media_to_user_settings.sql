/*
  # Add blur_media column to user_settings

  ## Summary
  Adds a dedicated `blur_media` boolean column to `user_settings` to control
  whether images and videos are blurred until tapped in both Chat and Vault.

  ## Changes
  - `user_settings.blur_media` (boolean, default true) — when enabled, media
    thumbnails in Chat and Vault are blurred; first tap reveals, second tap
    opens full-screen. Re-blurs when the user leaves the app.

  ## Notes
  - `blur_on_background` remains unchanged (it controls hiding the app in the
    OS task switcher, a separate concern)
  - Default is true so existing users get the blur behaviour on first load
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_settings' AND column_name = 'blur_media'
  ) THEN
    ALTER TABLE user_settings ADD COLUMN blur_media boolean DEFAULT true;
  END IF;
END $$;
