/*
  # Add activity_views table for per-user unread activity tracking

  ## Purpose
  Replaces the previous client-side AsyncStorage "seen" tracking and the single
  `read` boolean on `activity_events` (which could only represent one user's read
  state). The new table gives each user an independent, server-side unread feed.

  ## New Tables

  ### activity_views
  Records that a specific user has viewed a specific activity item.
  - `id` — primary key
  - `couple_id` — which couple this belongs to (for indexed queries)
  - `user_id` — the user who viewed the item
  - `source_table` — which table the item came from: 'interactions', 'chat_messages', or 'activity_events'
  - `source_id` — the UUID of the specific row in that source table
  - `viewed_at` — when the user viewed it (defaults to now)

  Unique constraint on (user_id, source_table, source_id) ensures a view is
  recorded only once per user per item.

  ## Security
  - RLS enabled
  - SELECT: users can only read their own view records
  - INSERT: users can only insert their own view records (user_id must match auth.uid())

  ## Notes
  - The existing `read` boolean on `activity_events` is NOT dropped (backward
    compatibility) but is no longer written by application code.
  - The unique constraint uses `ON CONFLICT DO NOTHING` semantics at the app layer
    to safely handle duplicate taps.
*/

CREATE TABLE IF NOT EXISTS activity_views (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id      uuid NOT NULL REFERENCES couples(id),
  user_id        uuid NOT NULL REFERENCES auth.users(id),
  source_table   text NOT NULL CHECK (source_table IN ('interactions', 'chat_messages', 'activity_events')),
  source_id      uuid NOT NULL,
  viewed_at      timestamptz NOT NULL DEFAULT now(),

  UNIQUE (user_id, source_table, source_id)
);

CREATE INDEX IF NOT EXISTS activity_views_couple_user_idx
  ON activity_views (couple_id, user_id);

CREATE INDEX IF NOT EXISTS activity_views_source_idx
  ON activity_views (source_table, source_id);

ALTER TABLE activity_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own activity views"
  ON activity_views FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own activity views"
  ON activity_views FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);
