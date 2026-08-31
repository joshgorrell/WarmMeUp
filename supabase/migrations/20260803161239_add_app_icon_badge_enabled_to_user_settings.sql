/*
# Add app_icon_badge_enabled to user_settings

1. New Columns
- `user_settings.app_icon_badge_enabled` (boolean, NOT NULL, DEFAULT true)
  Per-user toggle controlling whether the iOS home-screen app icon shows a
  badge count for unread activity (dares, dice, wishes, chat messages, vault
  items). On by default for new and existing users.

2. Modified Tables
- `user_settings` — one new column added. No existing columns changed or removed.

3. Security
- No RLS policy changes. The existing owner-scoped SELECT / INSERT / UPDATE
  policies on `user_settings` already cover the new column because they apply
  at the row level, not per-column.

4. Important Notes
- The column defaults to `true` so every existing row automatically gets the
  badge enabled after the migration runs — no backfill needed.
- The app treats this as an iOS-only feature; on Android and web the setting is
  stored but has no visible effect.
*/

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS app_icon_badge_enabled boolean NOT NULL DEFAULT true;
