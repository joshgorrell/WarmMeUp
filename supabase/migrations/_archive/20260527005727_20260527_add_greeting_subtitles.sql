/*
  # Add greeting_subtitles table

  ## Summary
  Introduces a new `greeting_subtitles` table to allow admins to manage the
  rotating subtitle phrases shown on the home screen (e.g. "Everything is set
  up and waiting."). Previously these were hardcoded in the app.

  ## New Tables
  - `greeting_subtitles`
    - `id` (uuid, primary key)
    - `text` (text, the phrase displayed to users)
    - `is_active` (boolean, default true — inactive phrases are excluded from rotation)
    - `sort_order` (integer, default 0 — for display ordering in admin UI)
    - `created_at` (timestamptz)

  ## Security
  - RLS enabled: all authenticated users can SELECT active phrases
  - Admins only (profiles.is_admin = true) can INSERT, UPDATE, DELETE

  ## Seed Data
  All 17 previously hardcoded phrases are inserted as active rows.
*/

CREATE TABLE IF NOT EXISTS greeting_subtitles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  text text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE greeting_subtitles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read greeting subtitles"
  ON greeting_subtitles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert greeting subtitles"
  ON greeting_subtitles FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

CREATE POLICY "Admins can update greeting subtitles"
  ON greeting_subtitles FOR UPDATE
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

CREATE POLICY "Admins can delete greeting subtitles"
  ON greeting_subtitles FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

-- Seed all 17 previously hardcoded phrases
INSERT INTO greeting_subtitles (text, sort_order) VALUES
  ('What kind of fun are we starting?', 1),
  ('What''s the mood tonight?', 2),
  ('Ready to stir up some trouble?', 3),
  ('Let''s make tonight interesting.', 4),
  ('What are we getting into today?', 5),
  ('Time to warm things up?', 6),
  ('Let the flirting begin.', 7),
  ('Your private playground awaits.', 8),
  ('What''s the vibe between you two today?', 9),
  ('Feeling playful?', 10),
  ('What''s today''s temptation?', 11),
  ('Something fun is about to happen.', 12),
  ('Explore what''s waiting for you.', 13),
  ('Your private playground is ready.', 14),
  ('Set the stage before your partner arrives.', 15),
  ('Get familiar before the fun begins.', 16),
  ('Everything is set up and waiting.', 17);
