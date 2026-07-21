/*
  # Add media_reactions table and activity_events metadata column

  ## Summary
  Adds per-user emoji reactions to chat messages and vault items, plus a generic
  metadata column to activity_events so reaction events can carry the emoji without
  a dedicated column.

  ## New Tables

  ### media_reactions
  One reaction per user per media item (chat message or vault item).
  - `id` — primary key
  - `couple_id` — which couple this belongs to (for RLS + subscriptions)
  - `user_id` — user who reacted
  - `source_table` — 'chat_messages' or 'vault_items'
  - `source_id` — uuid of the item being reacted to
  - `emoji` — the reaction emoji string
  - `created_at` — when the reaction was placed

  Unique constraint on (user_id, source_table, source_id) enforces one reaction
  per user per item. Upsert on this constraint replaces the previous emoji.

  ## Modified Tables

  ### activity_events
  - Adds nullable `metadata` jsonb column to carry arbitrary event payload
    (e.g., `{ "emoji": "🔥", "media_type": "photo", "source_table": "chat_messages" }`).

  ## Security
  - RLS enabled on media_reactions
  - SELECT: both users in the couple can read all reactions for their couple
  - INSERT: user_id must equal auth.uid()
  - UPDATE: user_id must equal auth.uid()
  - DELETE: user_id must equal auth.uid()

  ## Notes
  1. The unique constraint uses ON CONFLICT DO NOTHING / DO UPDATE at app layer
     to replace or toggle reactions.
  2. activity_events INSERT policy already allows authenticated users to log their
     own events — no change needed for the new event_type 'media_reaction'.
*/

-- ─── media_reactions ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS media_reactions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id    uuid NOT NULL REFERENCES couples(id),
  user_id      uuid NOT NULL REFERENCES auth.users(id),
  source_table text NOT NULL CHECK (source_table IN ('chat_messages', 'vault_items')),
  source_id    uuid NOT NULL,
  emoji        text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),

  UNIQUE (user_id, source_table, source_id)
);

CREATE INDEX IF NOT EXISTS media_reactions_lookup_idx
  ON media_reactions (couple_id, source_table, source_id);

CREATE INDEX IF NOT EXISTS media_reactions_couple_time_idx
  ON media_reactions (couple_id, created_at DESC);

ALTER TABLE media_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Couple members can read media reactions"
  ON media_reactions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM couples
      WHERE couples.id = media_reactions.couple_id
        AND (couples.user_a_id = auth.uid() OR couples.user_b_id = auth.uid())
    )
  );

CREATE POLICY "Users can insert own media reactions"
  ON media_reactions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own media reactions"
  ON media_reactions FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own media reactions"
  ON media_reactions FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ─── activity_events: add metadata column ───────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'activity_events' AND column_name = 'metadata'
  ) THEN
    ALTER TABLE activity_events ADD COLUMN metadata jsonb;
  END IF;
END $$;
