/*
  # Add activity_events table

  ## Purpose
  Creates a persistent record of privacy-relevant events (screenshots, etc.) so that
  in-app notifications survive regardless of push notification settings or dismissal.
  Push is now one optional channel on top of this table — the table is the source of truth.

  ## New Tables
  - `activity_events`
    - `id` (uuid, PK)
    - `couple_id` (uuid, FK → couples) — scopes the event to a couple
    - `actor_user_id` (uuid, FK → auth.users) — who performed the action
    - `target_user_id` (uuid, FK → auth.users) — who should be notified
    - `event_type` (text) — e.g. 'screenshot_detected'
    - `vault_item_id` (uuid, nullable FK → vault_items) — linked content if applicable
    - `read` (boolean, default false) — whether the target has seen this event
    - `created_at` (timestamptz, default now)

  ## Indexes
  - `(couple_id, target_user_id, read)` — fast unread count queries
  - `(couple_id, created_at desc)` — fast feed queries

  ## Security
  - RLS enabled
  - Authenticated users can read events where they are target or actor in their couple
  - No client insert/update/delete — only service role (edge function) writes records
  - Update policy allows target_user_id to mark events as read
*/

CREATE TABLE IF NOT EXISTS activity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id uuid NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  vault_item_id uuid REFERENCES vault_items(id) ON DELETE SET NULL,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS activity_events_unread_idx
  ON activity_events (couple_id, target_user_id, read);

CREATE INDEX IF NOT EXISTS activity_events_feed_idx
  ON activity_events (couple_id, created_at DESC);

ALTER TABLE activity_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Couple members can read their activity events"
  ON activity_events FOR SELECT
  TO authenticated
  USING (
    auth.uid() = target_user_id OR auth.uid() = actor_user_id
  );

CREATE POLICY "Target user can mark events as read"
  ON activity_events FOR UPDATE
  TO authenticated
  USING (auth.uid() = target_user_id)
  WITH CHECK (auth.uid() = target_user_id);
