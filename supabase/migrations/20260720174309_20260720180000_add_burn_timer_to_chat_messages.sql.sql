/*
# Add self-destruct (burn) timer to chat messages

1. Overview
- Adds a post-send "self-destruct" timer to media messages in Chat.
- When a user long-presses a sent photo/video and picks 1 / 5 / 10 minutes,
  the message is marked with a burn duration and an absolute expiry timestamp.
- A live countdown is shown on the bubble; when it reaches zero the message
  is soft-deleted (deleted_at set) and the underlying storage object removed,
  so it disappears for both partners.

2. New Columns on `chat_messages`
- `burn_after_seconds integer DEFAULT NULL`
  The chosen duration in seconds (60, 300, 600) when a timer is set.
  NULL means no timer is active.
- `burns_at timestamptz DEFAULT NULL`
  The absolute expiry timestamp. Computed by the trigger below as
  `now() + burn_after_seconds` whenever `burn_after_seconds` is set/changed,
  and cleared to NULL when the timer is cancelled.

3. Trigger: `trg_chat_messages_sync_burns_at`
- BEFORE UPDATE on `chat_messages`.
- Whenever `burn_after_seconds` is changed (set or cleared), recomputes
  `burns_at` so the client only needs to update a single column.
- If `burn_after_seconds` is NULL, `burns_at` is set to NULL.
- If `burn_after_seconds` is set, `burns_at` is set to `now() + burn_after_seconds`.

4. Security
- No new RLS policies needed. The existing couple-scoped UPDATE policy on
  `chat_messages` already permits either partner in a couple to update any
  column on their couple's messages, which includes setting/clearing the
  burn timer. No new tables are created.

5. Index
- Partial index on `burns_at` for rows that are still pending burn, to
  support efficient lazy-cleanup queries (WHERE burns_at IS NOT NULL AND
  deleted_at IS NULL).

6. Notes
- Cleanup is lazy and client-driven: on chat load and on countdown expiry,
  the client soft-deletes any message whose `burns_at` is in the past and
  removes the storage object. This avoids the need for pg_cron (which is
  not available on this project).
- The burn timer only affects the chat copy. If the media was also saved to
  the Vault (vault_item_id), the Vault copy is left intact.
*/

-- Add burn_after_seconds column
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'chat_messages' AND column_name = 'burn_after_seconds'
  ) THEN
    ALTER TABLE chat_messages ADD COLUMN burn_after_seconds integer DEFAULT NULL;
  END IF;
END $$;

-- Add burns_at column
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'chat_messages' AND column_name = 'burns_at'
  ) THEN
    ALTER TABLE chat_messages ADD COLUMN burns_at timestamptz DEFAULT NULL;
  END IF;
END $$;

-- Trigger function to keep burns_at in sync with burn_after_seconds
CREATE OR REPLACE FUNCTION sync_chat_messages_burns_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.burn_after_seconds IS DISTINCT FROM OLD.burn_after_seconds THEN
    IF NEW.burn_after_seconds IS NULL THEN
      NEW.burns_at := NULL;
    ELSE
      NEW.burns_at := now() + make_interval(secs => NEW.burn_after_seconds);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- BEFORE UPDATE trigger
DROP TRIGGER IF EXISTS trg_chat_messages_sync_burns_at ON chat_messages;
CREATE TRIGGER trg_chat_messages_sync_burns_at
  BEFORE UPDATE ON chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION sync_chat_messages_burns_at();

-- Partial index for pending burns (lazy cleanup queries)
CREATE INDEX IF NOT EXISTS idx_chat_messages_pending_burn
  ON chat_messages (burns_at)
  WHERE burns_at IS NOT NULL AND deleted_at IS NULL;
