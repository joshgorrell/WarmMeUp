/*
  # Add storage path columns to vault_items and interactions

  ## Security improvement
  Instead of storing full signed URLs (which embed auth tokens and cannot be rotated),
  we now store only the raw storage object path and the bucket name.
  Signed URLs are generated on-demand client-side with short TTLs.

  ## Changes

  ### vault_items
  - Add `storage_path` (text) — raw object path within the bucket, e.g. {couple_id}/{user_id}/{filename}
  - Add `storage_bucket` (text, default 'vault') — bucket name
  - Keep `file_path` for backward compatibility (existing rows); new rows leave it empty

  ### interactions
  - Add `media_storage_path` (text) — raw object path within the bucket
  - Add `media_storage_bucket` (text, default 'chat_media') — bucket name
  - Keep `media_url` for backward compatibility; new rows leave it null

  ## Notes
  - Existing rows with signed URLs in file_path/media_url are not migrated (they will continue
    to work until the URLs expire; all new uploads use storage_path instead)
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'vault_items' AND column_name = 'storage_path'
  ) THEN
    ALTER TABLE vault_items ADD COLUMN storage_path text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'vault_items' AND column_name = 'storage_bucket'
  ) THEN
    ALTER TABLE vault_items ADD COLUMN storage_bucket text DEFAULT 'vault';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'interactions' AND column_name = 'media_storage_path'
  ) THEN
    ALTER TABLE interactions ADD COLUMN media_storage_path text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'interactions' AND column_name = 'media_storage_bucket'
  ) THEN
    ALTER TABLE interactions ADD COLUMN media_storage_bucket text DEFAULT 'chat_media';
  END IF;
END $$;
