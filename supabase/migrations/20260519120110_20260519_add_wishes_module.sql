/*
  # Add Wishes Module

  ## Summary
  Replaces the Ask/Tell Me ephemeral interaction system with a new persistent "Wish" module —
  a private couple desire-sharing system for dreams, goals, fantasies, date ideas, gifts, and more.

  ## New Tables

  ### `wishes`
  - Core wish record owned by a user within a couple
  - Supports: title, description, category, optional image, optional link
  - Status lifecycle: draft → shared → fulfilled → archived
  - Fulfilled wishes store a note, fulfilled_at timestamp, and optional memory image

  ### `wish_reactions`
  - Emoji reactions from either partner on a wish
  - One reaction per user per wish (upsert on emoji)

  ## Modified Tables

  ### `point_config`
  - Adds `wish_sent` (5 pts) — sharing a wish with your partner
  - Adds `wish_fulfilled` (20 pts) — marking a wish as granted

  ### `monthly_scores`
  - Adds `wishes_sent integer NOT NULL DEFAULT 0`
  - Adds `wishes_fulfilled integer NOT NULL DEFAULT 0`

  ## Security
  - RLS enabled on both new tables
  - All policies restricted to authenticated couple members only
  - Users can only read/write wishes belonging to their own couple
  - Reactions similarly scoped to couple membership

  ## Notes
  1. Wish categories are stored as text with a CHECK constraint
  2. Images stored in Supabase Storage under the existing vault bucket with path prefix `wishes/`
  3. The old `tell_me_prompts` table and `tell_me` interaction type are preserved for data integrity
  4. No changes to the `interactions` table — Wish is standalone, not ephemeral
*/

-- ─── wishes ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS wishes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id uuid NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  created_by_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  category text CHECK (category IN (
    'Romantic', 'Travel', 'Food & Drink', 'Fantasy',
    'Adventure', 'Gifts', 'Date Night', 'Intimate', 'Someday'
  )),
  image_storage_path text,
  image_storage_bucket text DEFAULT 'vault',
  link text,
  status text NOT NULL DEFAULT 'shared' CHECK (status IN ('draft', 'shared', 'fulfilled', 'archived')),
  fulfilled_at timestamptz,
  fulfilled_note text,
  fulfilled_image_path text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE wishes ENABLE ROW LEVEL SECURITY;

-- Couple members can view all wishes in their couple
CREATE POLICY "Couple members can view their wishes"
  ON wishes FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM couples
      WHERE couples.id = wishes.couple_id
        AND (couples.user_a_id = auth.uid() OR couples.user_b_id = auth.uid())
    )
  );

-- Users can insert wishes for their own couple
CREATE POLICY "Couple members can create wishes"
  ON wishes FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM couples
      WHERE couples.id = wishes.couple_id
        AND (couples.user_a_id = auth.uid() OR couples.user_b_id = auth.uid())
    )
  );

-- Users can update their own wishes (and partner can update status for fulfillment)
CREATE POLICY "Couple members can update wishes"
  ON wishes FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM couples
      WHERE couples.id = wishes.couple_id
        AND (couples.user_a_id = auth.uid() OR couples.user_b_id = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM couples
      WHERE couples.id = wishes.couple_id
        AND (couples.user_a_id = auth.uid() OR couples.user_b_id = auth.uid())
    )
  );

-- Users can delete their own wishes only
CREATE POLICY "Users can delete own wishes"
  ON wishes FOR DELETE
  TO authenticated
  USING (created_by_user_id = auth.uid());

-- ─── wish_reactions ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS wish_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wish_id uuid NOT NULL REFERENCES wishes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (wish_id, user_id)
);

ALTER TABLE wish_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Couple members can view wish reactions"
  ON wish_reactions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM wishes w
      JOIN couples c ON c.id = w.couple_id
      WHERE w.id = wish_reactions.wish_id
        AND (c.user_a_id = auth.uid() OR c.user_b_id = auth.uid())
    )
  );

CREATE POLICY "Users can add wish reactions"
  ON wish_reactions FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM wishes w
      JOIN couples c ON c.id = w.couple_id
      WHERE w.id = wish_reactions.wish_id
        AND (c.user_a_id = auth.uid() OR c.user_b_id = auth.uid())
    )
  );

CREATE POLICY "Users can update own wish reactions"
  ON wish_reactions FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own wish reactions"
  ON wish_reactions FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- ─── point_config additions ───────────────────────────────────────────────────

INSERT INTO point_config (event_key, label, points)
VALUES
  ('wish_sent',      'Wish — Shared with partner', 5),
  ('wish_fulfilled', 'Wish — Granted',             20)
ON CONFLICT (event_key) DO NOTHING;

-- ─── monthly_scores additions ─────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'monthly_scores' AND column_name = 'wishes_sent'
  ) THEN
    ALTER TABLE monthly_scores ADD COLUMN wishes_sent integer NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'monthly_scores' AND column_name = 'wishes_fulfilled'
  ) THEN
    ALTER TABLE monthly_scores ADD COLUMN wishes_fulfilled integer NOT NULL DEFAULT 0;
  END IF;
END $$;

-- ─── indexes ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS wishes_couple_id_idx ON wishes (couple_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS wish_reactions_wish_id_idx ON wish_reactions (wish_id);
