-- Add separate blur controls for Chat and Vault.
-- Backfill from the existing blur_media column so existing users keep their preference.
ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS blur_chat_media boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS blur_vault_media boolean DEFAULT true;

-- Backfill: carry over the current blur_media value for existing rows
UPDATE user_settings
SET
  blur_chat_media = COALESCE(blur_chat_media, blur_media, true),
  blur_vault_media = COALESCE(blur_vault_media, blur_media, true)
WHERE blur_chat_media IS NULL OR blur_vault_media IS NULL;
