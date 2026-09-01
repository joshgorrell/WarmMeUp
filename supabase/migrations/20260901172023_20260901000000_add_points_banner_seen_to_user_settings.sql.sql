/*
# Add points_banner_seen flag to user_settings

## Purpose
Adds a one-time banner flag so the My Stats page can show a first-visit
explainer about the points system, then never show it again once dismissed.

## Changes
- New column `points_banner_seen` (boolean, default false) on `user_settings`.
- Backfills all existing rows to false.

## Security
- No RLS policy changes needed — the column is read/written by the owning
  user through existing user_settings policies.
*/

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS points_banner_seen boolean NOT NULL DEFAULT false;

-- Backfill existing rows (no-op if column already existed with data)
UPDATE user_settings SET points_banner_seen = false WHERE points_banner_seen IS NULL;
