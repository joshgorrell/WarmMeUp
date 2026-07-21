/*
  # Add chat_font_scale to user_settings

  ## Summary
  Adds a per-user chat text size preference to the user_settings table.

  ## Changes

  ### Modified Tables
  - `user_settings`
    - New column: `chat_font_scale` (real, NOT NULL, default 1.0)
      - Stores the user's chosen chat bubble text size multiplier.
      - 0.85 = Small, 1.0 = Standard (default), 1.2 = Large
      - Existing rows receive the default value of 1.0 automatically.

  ## Notes
  - No RLS changes required — existing policies on user_settings already control access.
  - Existing rows are backfilled to 1.0 via the DEFAULT clause.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_settings' AND column_name = 'chat_font_scale'
  ) THEN
    ALTER TABLE user_settings ADD COLUMN chat_font_scale REAL NOT NULL DEFAULT 1.0;
  END IF;
END $$;
