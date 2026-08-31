/*
  # Add Decline Prompts and Decline Reason to Interactions

  ## Summary
  This migration supports the redesigned Dare module where partners can decline a dare
  by selecting a pre-written decline response. The selected response is stored on the
  interaction so the sender can see what their partner chose.

  ## Changes

  ### 1. New Column: interactions.decline_reason
  - Adds a nullable `decline_reason text` column to the `interactions` table
  - Populated when a receiver declines a dare using a decline prompt

  ### 2. New Table: decline_prompts
  - Stores default and couple-specific decline responses
  - Schema matches the existing dare_prompts / dice_prompts pattern
  - Columns:
    - `id` uuid primary key
    - `couple_id` uuid nullable — null for global defaults
    - `created_by_user_id` uuid nullable — null for global defaults
    - `text` text not null — the decline response text
    - `is_default` boolean default true — whether this is a system default
    - `is_active` boolean default true — soft-delete / disable flag
    - `sort_order` integer default 0 — display ordering
    - `created_at` timestamptz

  ### 3. Seed Data
  - Inserts 7 default decline prompts that all couples share by default

  ### 4. Security
  - RLS enabled on decline_prompts
  - Authenticated users can read active defaults and their own couple's prompts
  - Couples can insert, update, and delete their own (non-default) prompts
  - couple_hidden_prompts already supports arbitrary prompt_table values so no
    migration is needed there — clients use prompt_table = 'decline_prompts'
*/

-- 1. Add decline_reason to interactions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'interactions' AND column_name = 'decline_reason'
  ) THEN
    ALTER TABLE interactions ADD COLUMN decline_reason text;
  END IF;
END $$;

-- 2. Create decline_prompts table
CREATE TABLE IF NOT EXISTS decline_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id uuid REFERENCES couples(id) ON DELETE CASCADE,
  created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  text text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Enable RLS
ALTER TABLE decline_prompts ENABLE ROW LEVEL SECURITY;

-- 4. Read policy: authenticated users can read active defaults + their couple's prompts
CREATE POLICY "Users can read active defaults and own couple decline prompts"
  ON decline_prompts
  FOR SELECT
  TO authenticated
  USING (
    is_active = true
    AND (
      is_default = true
      OR couple_id IN (
        SELECT id FROM couples
        WHERE user_a_id = auth.uid() OR user_b_id = auth.uid()
      )
    )
  );

-- 5. Insert policy: couple members can add custom decline prompts
CREATE POLICY "Couple members can insert decline prompts"
  ON decline_prompts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    is_default = false
    AND couple_id IN (
      SELECT id FROM couples
      WHERE user_a_id = auth.uid() OR user_b_id = auth.uid()
    )
    AND created_by_user_id = auth.uid()
  );

-- 6. Update policy: users can update their own couple's non-default prompts
CREATE POLICY "Couple members can update own decline prompts"
  ON decline_prompts
  FOR UPDATE
  TO authenticated
  USING (
    is_default = false
    AND couple_id IN (
      SELECT id FROM couples
      WHERE user_a_id = auth.uid() OR user_b_id = auth.uid()
    )
  )
  WITH CHECK (
    is_default = false
    AND couple_id IN (
      SELECT id FROM couples
      WHERE user_a_id = auth.uid() OR user_b_id = auth.uid()
    )
  );

-- 7. Delete policy: users can delete their own couple's non-default prompts
CREATE POLICY "Couple members can delete own decline prompts"
  ON decline_prompts
  FOR DELETE
  TO authenticated
  USING (
    is_default = false
    AND couple_id IN (
      SELECT id FROM couples
      WHERE user_a_id = auth.uid() OR user_b_id = auth.uid()
    )
  );

-- 8. Seed the 7 default decline prompts
INSERT INTO decline_prompts (text, is_default, is_active, sort_order)
VALUES
  ('Too spicy 🌶️', true, true, 1),
  ('Not today 😅', true, true, 2),
  ('Hard pass', true, true, 3),
  ('Maybe later 😉', true, true, 4),
  ('Challenge declined', true, true, 5),
  ('Out of my league', true, true, 6),
  ('I plead the fifth', true, true, 7)
ON CONFLICT DO NOTHING;

-- 9. Index for couple lookups
CREATE INDEX IF NOT EXISTS idx_decline_prompts_couple_id ON decline_prompts(couple_id);
CREATE INDEX IF NOT EXISTS idx_decline_prompts_is_default ON decline_prompts(is_default) WHERE is_default = true;
