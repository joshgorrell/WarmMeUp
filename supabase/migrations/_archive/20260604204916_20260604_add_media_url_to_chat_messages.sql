/*
  # Add media_url column to chat_messages

  ## Purpose
  Stores a pre-generated signed URL for the uploaded media file directly in the
  chat_messages row. When the recipient's device receives the realtime INSERT
  event, payload.new.media_url is already populated with a ready-to-use URL,
  eliminating the extra createSignedUrls round-trip that previously caused a
  200-400ms delay before the image could be displayed.

  ## Changes
  - chat_messages: adds nullable `media_url text` column

  ## Notes
  - The sender generates this URL with a 7-day expiry immediately after uploading
    the file, then includes it in the INSERT payload.
  - Older messages (sent before this migration) will have media_url = NULL and
    continue to use the existing fetchSignedUrls fallback on initial load.
  - No RLS changes needed — the column is read-only from the client's perspective
    (written once on insert, never updated).
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'chat_messages'
      AND column_name = 'media_url'
  ) THEN
    ALTER TABLE chat_messages ADD COLUMN media_url text;
  END IF;
END $$;
