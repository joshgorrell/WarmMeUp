/*
# Add reply_to column to chat_messages

## Purpose
Enables iMessage-style threaded replies in chat. A message can reference
the message it is replying to via a self-referencing foreign key.

## Changes
- Adds `reply_to uuid REFERENCES chat_messages(id) ON DELETE SET NULL` to `chat_messages`.
  - Nullable: existing messages and non-reply messages have `reply_to = null`.
  - `ON DELETE SET NULL`: if the original message row is removed, the reply's
    reference becomes null rather than cascading a delete of the reply itself.
- Adds an index on `reply_to` for efficient lookup of quoted parent messages.

## Security
- No RLS policy changes needed. Existing couple-scoped policies on
  chat_messages already allow both members of a couple to read all messages
  in their couple, so the quoted parent is always visible to both users.
*/

ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS reply_to uuid REFERENCES chat_messages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_chat_messages_reply_to
  ON chat_messages (reply_to) WHERE reply_to IS NOT NULL;