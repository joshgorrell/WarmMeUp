/*
# Add "first viewed" tracking and rewire burn timer to start on open

1. Overview
- Adds a `first_viewed_at` column to `chat_messages` that records the moment
  the recipient first opens/views a message.
- Rewrites the `sync_chat_messages_burns_at` trigger so the burn countdown
  starts from `first_viewed_at` (when the partner opens the message) instead
  of `now()` (when the sender sets the timer).
- This enables two features:
  a) A "seen" eye icon on all outgoing media so the sender knows whether
     their partner has opened their photo/video.
  b) Burn timers that don't start counting down until the recipient actually
     opens the message.

2. New Column on `chat_messages`
- `first_viewed_at timestamptz DEFAULT NULL`
  The timestamp when the recipient first opened/viewed the message.
  NULL means the recipient has not yet opened it.
  Set by the client (recipient side) when they reveal media or when the
  chat screen renders an incoming text message with a burn timer.

3. Modified Trigger: `sync_chat_messages_burns_at`
- BEFORE UPDATE on `chat_messages`.
- Previously: when `burn_after_seconds` changed, set `burns_at = now() + burn_after_seconds`.
- Now: `burns_at` is computed as `first_viewed_at + burn_after_seconds`.
  - If `burn_after_seconds` is NULL → `burns_at = NULL` (timer cancelled).
  - If `burn_after_seconds` is set but `first_viewed_at` is NULL → `burns_at = NULL`
    (timer armed but not yet started — waiting for recipient to open).
  - If both are set → `burns_at = first_viewed_at + burn_after_seconds`.
- The trigger now also fires the `burns_at` recompute when `first_viewed_at`
  transitions from NULL to a value (recipient opens the message), so the
  countdown starts at that moment.

4. Security
- No new RLS policies needed. The existing couple-scoped UPDATE policy on
  `chat_messages` already permits either partner to update any column on
  their couple's messages, including `first_viewed_at`.
- No column-level restrictions exist on `chat_messages`.

5. Index
- The existing partial index `idx_chat_messages_pending_burn` on `burns_at`
  remains correct — it filters on `burns_at IS NOT NULL AND deleted_at IS NULL`,
  which now also covers armed-but-unopened messages (those have NULL burns_at
  so they're excluded from the index, which is correct).

6. Notes
- Messages sent before this migration have NULL `first_viewed_at`. The first
  time the recipient opens the chat after the app update, incoming text
  messages with burn timers will be marked as viewed, and media messages
  will be marked on next reveal. This is the correct behavior.
- If the partner never opens the item, the burn timer waits indefinitely.
- The sender should NOT mark their own messages as viewed; the client guards
  all `first_viewed_at` updates with a `sender_id !== user.id` check.
*/

-- Add first_viewed_at column
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'chat_messages' AND column_name = 'first_viewed_at'
  ) THEN
    ALTER TABLE chat_messages ADD COLUMN first_viewed_at timestamptz DEFAULT NULL;
  END IF;
END $$;

-- Rewrite the trigger function so burns_at is computed from first_viewed_at
CREATE OR REPLACE FUNCTION sync_chat_messages_burns_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Recompute burns_at whenever burn_after_seconds or first_viewed_at changes
  IF NEW.burn_after_seconds IS DISTINCT FROM OLD.burn_after_seconds
     OR NEW.first_viewed_at IS DISTINCT FROM OLD.first_viewed_at THEN
    IF NEW.burn_after_seconds IS NULL THEN
      NEW.burns_at := NULL;
    ELSIF NEW.first_viewed_at IS NULL THEN
      -- Timer armed but recipient hasn't opened it yet — don't start counting
      NEW.burns_at := NULL;
    ELSE
      NEW.burns_at := NEW.first_viewed_at + make_interval(secs => NEW.burn_after_seconds);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Ensure the trigger exists (idempotent — drop and recreate)
DROP TRIGGER IF EXISTS trg_chat_messages_sync_burns_at ON chat_messages;
CREATE TRIGGER trg_chat_messages_sync_burns_at
  BEFORE UPDATE ON chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION sync_chat_messages_burns_at();