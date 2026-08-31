/*
# Add user_diagnostics table

## Purpose
Stores the most recent non-sensitive diagnostic snapshot per authenticated user.
Snapshots are captured periodically and after auth/signup errors by the client app.
Admin users can read any user's snapshot to assist with support investigations.

## New Tables

### user_diagnostics
Stores one row per user (upsert by user_id). Contains:
- `user_id` (uuid, primary key, FK → auth.users) — owner
- `email` (text, nullable) — recorded at capture time; helps admins identify the user
- `snapshot` (jsonb) — non-sensitive diagnostic payload including:
    app version, build, OTA update ID, runtime version, channel, update source,
    platform, OS version, network reachability, auth status, last auth error,
    push token status, subscription status/source, last 20 app events, current route
- `captured_at` (timestamptz) — when the snapshot was taken

## Security
- RLS enabled.
- Authenticated users can INSERT and UPDATE their own row only.
- Admin/super-admin profiles can SELECT any row (support investigations).
- No user-facing SELECT — users cannot read their own snapshots through the client.
- No public DELETE.

## Important Notes
1. Secrets are NEVER stored: no access tokens, refresh tokens, API keys, passwords, or full auth headers.
2. The `user_id` column is the primary key — upserts by user_id naturally keep only the latest snapshot.
3. Admin read policy checks `profiles.is_admin OR profiles.is_super_admin` via an EXISTS subquery.
*/

CREATE TABLE IF NOT EXISTS user_diagnostics (
  user_id   uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email     text,
  snapshot  jsonb NOT NULL DEFAULT '{}',
  captured_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE user_diagnostics ENABLE ROW LEVEL SECURITY;

-- Authenticated users: insert their own row
DROP POLICY IF EXISTS "insert_own_diagnostics" ON user_diagnostics;
CREATE POLICY "insert_own_diagnostics" ON user_diagnostics FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Authenticated users: update their own row
DROP POLICY IF EXISTS "update_own_diagnostics" ON user_diagnostics;
CREATE POLICY "update_own_diagnostics" ON user_diagnostics FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Admins/super-admins: read any row for support investigations
DROP POLICY IF EXISTS "admin_select_diagnostics" ON user_diagnostics;
CREATE POLICY "admin_select_diagnostics" ON user_diagnostics FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND (profiles.is_admin = true OR profiles.is_super_admin = true)
    )
  );
