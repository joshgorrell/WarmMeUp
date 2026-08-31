/*
  # Set REPLICA IDENTITY FULL on chat_messages

  ## Problem
  Mixed-content chat messages (image + text caption) were disappearing for the
  recipient after being sent. The insert succeeded but the message became blank.

  ## Root Cause
  With the default REPLICA IDENTITY (primary key only), Supabase Realtime UPDATE
  events do not guarantee all columns are present in `payload.new`. When the
  vault auto-save runs immediately after a send, it updates `vault_item_id` on
  the chat_messages row. This UPDATE event arrives on the recipient's device and
  overwrites the correctly-stored message in React state with a potentially
  incomplete `payload.new` — stripping `content_text` and `media_storage_path`.

  ## Fix
  Setting REPLICA IDENTITY FULL ensures Supabase Realtime includes ALL column
  values in every UPDATE and DELETE event's `payload.new` and `payload.old`.
  This is the canonical Supabase recommendation for tables used with
  `postgres_changes` subscriptions.
*/

ALTER TABLE chat_messages REPLICA IDENTITY FULL;
