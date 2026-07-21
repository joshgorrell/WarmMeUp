/*
  # Chat & Vault media integration

  1. Changes
    - Add `chat_auto_save_to_vault` boolean to `user_settings` (default true)
    - Add `vault_item_id` nullable FK on `chat_messages` — links a chat message to its vault copy
    - Add `chat_message_id` nullable FK on `vault_items` — links a vault copy back to its chat message

  2. Purpose
    These columns enable:
    - Auto-saving chat media to Vault on send (controlled by the user setting)
    - Synchronized deletion: deleting from Chat also deletes from Vault and vice versa

  3. Security
    - Existing RLS policies cover both tables; no new policies needed for these nullable FK columns
*/

-- User setting: auto-save chat media to vault (default ON)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_settings' AND column_name = 'chat_auto_save_to_vault'
  ) THEN
    ALTER TABLE user_settings ADD COLUMN chat_auto_save_to_vault boolean NOT NULL DEFAULT true;
  END IF;
END $$;

-- Cross-reference: chat_messages.vault_item_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chat_messages' AND column_name = 'vault_item_id'
  ) THEN
    ALTER TABLE chat_messages ADD COLUMN vault_item_id uuid REFERENCES vault_items(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Cross-reference: vault_items.chat_message_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'vault_items' AND column_name = 'chat_message_id'
  ) THEN
    ALTER TABLE vault_items ADD COLUMN chat_message_id uuid REFERENCES chat_messages(id) ON DELETE SET NULL;
  END IF;
END $$;
