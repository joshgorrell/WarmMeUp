-- Add thumbnail_path to chat_messages and backfill from existing thumbnail naming convention.
-- The upload code already generates and uploads a _thumb.jpg thumbnail alongside
-- each photo, but the path was never saved on the chat message row. This migration
-- adds the column and backfills it for existing photo messages.

ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS thumbnail_path text;

-- Backfill: for photo messages that have a media_storage_path but no thumbnail_path,
-- derive the thumbnail path by replacing the extension with _thumb.jpg.
-- e.g. couple/user/123456.jpg -> couple/user/123456_thumb.jpg
UPDATE public.chat_messages
SET thumbnail_path = regexp_replace(media_storage_path, '\.[^.]+$', '_thumb.jpg')
WHERE media_storage_path IS NOT NULL
  AND thumbnail_path IS NULL
  AND media_type = 'photo'
  AND deleted_at IS NULL;
