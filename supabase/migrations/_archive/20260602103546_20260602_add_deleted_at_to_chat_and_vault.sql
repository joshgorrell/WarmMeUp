/*
  # Add soft-delete support to chat_messages and vault_items

  ## Summary
  Adds a `deleted_at` column to both `chat_messages` and `vault_items` so that
  deletions are non-destructive. Deleted rows are hidden from queries using
  `WHERE deleted_at IS NULL` rather than being permanently removed from the DB.

  ## Changes

  ### chat_messages
  - New column: `deleted_at timestamptz DEFAULT NULL`
    - NULL = active message visible to both partners
    - Non-NULL = soft-deleted, hidden from all read queries

  ### vault_items
  - New column: `deleted_at timestamptz DEFAULT NULL`
    - NULL = active vault item visible to both partners
    - Non-NULL = soft-deleted, hidden from the Vault grid and Recent Activity

  ## RLS Notes
  - Existing SELECT policies rely on `couple_id` membership; the app-layer `.is('deleted_at', null)`
    filter in every query is the primary mechanism for hiding deleted rows.
  - No RLS changes are required because the soft-delete column is set only by the owning user
    through the existing UPDATE policies (sender_id = auth.uid() for chat, uploaded_by_user_id for vault).

  ## Indexes
  - Partial indexes on (couple_id, created_at) WHERE deleted_at IS NULL keep paginated
    chat and vault queries fast even as soft-deleted rows accumulate over time.
*/

-- chat_messages: add deleted_at
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chat_messages' AND column_name = 'deleted_at'
  ) THEN
    ALTER TABLE chat_messages ADD COLUMN deleted_at timestamptz DEFAULT NULL;
  END IF;
END $$;

-- vault_items: add deleted_at
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'vault_items' AND column_name = 'deleted_at'
  ) THEN
    ALTER TABLE vault_items ADD COLUMN deleted_at timestamptz DEFAULT NULL;
  END IF;
END $$;

-- Partial index for fast chat pagination (most recent active messages per couple)
CREATE INDEX IF NOT EXISTS idx_chat_messages_active_couple
  ON chat_messages (couple_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- Partial index for fast vault queries (most recent active items per couple)
CREATE INDEX IF NOT EXISTS idx_vault_items_active_couple
  ON vault_items (couple_id, created_at DESC)
  WHERE deleted_at IS NULL;
