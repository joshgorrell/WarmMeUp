/*
  # Add media/privacy fields to interactions table

  ## Changes
  - Adds `media_url` (text) — storage path for an attached photo or video
  - Adds `media_type` (text) — 'photo' or 'video', nullable
  - Adds `allow_screenshot` (boolean, default false) — mirrors Vault privacy
  - Adds `allow_save` (boolean, default false) — allow saving to device
  - Adds `allow_share` (boolean, default false) — allow sharing out of app
  - Adds `screenshot_detected` (boolean, default false) — set true when OS screenshot captured
  - Adds `viewed_by_partner` (boolean, default false) — tracks first reveal by receiver

  ## Notes
  - All new columns are nullable-safe via DEFAULT values
  - Privacy defaults match Vault (restrictive by default)
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'interactions' AND column_name = 'media_url'
  ) THEN
    ALTER TABLE interactions ADD COLUMN media_url text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'interactions' AND column_name = 'media_type'
  ) THEN
    ALTER TABLE interactions ADD COLUMN media_type text CHECK (media_type IN ('photo', 'video'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'interactions' AND column_name = 'allow_screenshot'
  ) THEN
    ALTER TABLE interactions ADD COLUMN allow_screenshot boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'interactions' AND column_name = 'allow_save'
  ) THEN
    ALTER TABLE interactions ADD COLUMN allow_save boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'interactions' AND column_name = 'allow_share'
  ) THEN
    ALTER TABLE interactions ADD COLUMN allow_share boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'interactions' AND column_name = 'screenshot_detected'
  ) THEN
    ALTER TABLE interactions ADD COLUMN screenshot_detected boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'interactions' AND column_name = 'viewed_by_partner'
  ) THEN
    ALTER TABLE interactions ADD COLUMN viewed_by_partner boolean DEFAULT false;
  END IF;
END $$;
