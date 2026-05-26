/*
  # Add app_config table

  ## Purpose
  Provides a key/value store for global app configuration flags that admins
  can toggle without a new build. The first use case is `debug_mode_enabled`,
  which controls whether the hidden 5-tap emergency debug entry points on the
  weather and splash screens are active.

  ## New Tables
  - `app_config`
    - `key` (text, primary key) — the config flag name
    - `value` (jsonb, not null) — the flag value (boolean, string, number, etc.)
    - `updated_at` (timestamptz) — when the value was last changed
    - `updated_by` (uuid, nullable) — which admin user last changed it

  ## Security
  - RLS enabled; table is locked down by default
  - SELECT policy: any authenticated user can read all rows (app needs this on startup)
  - UPDATE policy: only users whose profile has is_admin = true may update rows
  - No INSERT/DELETE policies — rows are seeded by the migration and never added/removed at runtime

  ## Seed Data
  - `debug_mode_enabled` = false (hidden debug gestures are OFF by default)
*/

CREATE TABLE IF NOT EXISTS app_config (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz DEFAULT now(),
  updated_by uuid REFERENCES auth.users ON DELETE SET NULL
);

ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;

-- Any logged-in user can read config flags (needed at app startup)
CREATE POLICY "Authenticated users can read app_config"
  ON app_config
  FOR SELECT
  TO authenticated
  USING (true);

-- Only admins may update config flags
CREATE POLICY "Admins can update app_config"
  ON app_config
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

-- Seed the only row we need
INSERT INTO app_config (key, value, updated_at)
VALUES ('debug_mode_enabled', 'false'::jsonb, now())
ON CONFLICT (key) DO NOTHING;
