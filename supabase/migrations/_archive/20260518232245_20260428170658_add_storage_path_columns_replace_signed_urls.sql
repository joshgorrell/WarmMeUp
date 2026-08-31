
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
