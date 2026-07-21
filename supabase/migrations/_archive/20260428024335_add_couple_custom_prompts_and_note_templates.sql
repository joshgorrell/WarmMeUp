/*
  # Couple Custom Prompts & Note Templates

  ## Overview
  Enables couples to create their own custom prompts for Dice, Dare, and Ask,
  and to save custom quick-note templates. Also adds write RLS policies so
  authenticated couple members can manage their own prompts.

  ## Changes

  ### 1. New Table
  - `note_templates` — stores quick-note starter text per couple
    - `id` (uuid, primary key)
    - `couple_id` (uuid, FK → couples, required)
    - `created_by_user_id` (uuid, FK → auth.users, required)
    - `text` (text, required)
    - `is_default` (boolean, default false) — true for global defaults managed by admins
    - `is_active` (boolean, default true)
    - `created_at` (timestamptz)

  ### 2. New RLS Policies on dice_prompts
  - Couple members can insert custom prompts for their own couple
  - Couple members can update their own custom prompts
  - Couple members can delete their own custom prompts

  ### 3. New RLS Policies on dare_prompts (same as above)

  ### 4. New RLS Policies on tell_me_prompts (same as above)

  ### 5. RLS Policies on note_templates
  - Couple members can read their own templates + all default templates
  - Couple members can insert templates for their couple
  - Couple members can update templates they created
  - Couple members can delete templates they created
  - Admins can insert/update/delete default note templates

  ## Notes
  - couple_id = NULL means global default (admin-managed)
  - is_couple_member() helper check: user_a_id or user_b_id matches auth.uid()
*/

-- ============================================================
-- COUPLE WRITE POLICIES — DICE PROMPTS
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'dice_prompts' AND policyname = 'Couple members can insert own dice prompts'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Couple members can insert own dice prompts"
        ON dice_prompts FOR INSERT
        TO authenticated
        WITH CHECK (
          couple_id IS NOT NULL AND
          created_by_user_id = auth.uid() AND
          is_default = false AND
          EXISTS (
            SELECT 1 FROM couples
            WHERE id = couple_id
            AND (user_a_id = auth.uid() OR user_b_id = auth.uid())
          )
        )
    $policy$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'dice_prompts' AND policyname = 'Couple members can update own dice prompts'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Couple members can update own dice prompts"
        ON dice_prompts FOR UPDATE
        TO authenticated
        USING (
          couple_id IS NOT NULL AND
          created_by_user_id = auth.uid() AND
          is_default = false
        )
        WITH CHECK (
          couple_id IS NOT NULL AND
          created_by_user_id = auth.uid() AND
          is_default = false
        )
    $policy$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'dice_prompts' AND policyname = 'Couple members can delete own dice prompts'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Couple members can delete own dice prompts"
        ON dice_prompts FOR DELETE
        TO authenticated
        USING (
          couple_id IS NOT NULL AND
          created_by_user_id = auth.uid() AND
          is_default = false
        )
    $policy$;
  END IF;
END $$;

-- ============================================================
-- COUPLE WRITE POLICIES — DARE PROMPTS
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'dare_prompts' AND policyname = 'Couple members can insert own dare prompts'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Couple members can insert own dare prompts"
        ON dare_prompts FOR INSERT
        TO authenticated
        WITH CHECK (
          couple_id IS NOT NULL AND
          created_by_user_id = auth.uid() AND
          is_default = false AND
          EXISTS (
            SELECT 1 FROM couples
            WHERE id = couple_id
            AND (user_a_id = auth.uid() OR user_b_id = auth.uid())
          )
        )
    $policy$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'dare_prompts' AND policyname = 'Couple members can update own dare prompts'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Couple members can update own dare prompts"
        ON dare_prompts FOR UPDATE
        TO authenticated
        USING (
          couple_id IS NOT NULL AND
          created_by_user_id = auth.uid() AND
          is_default = false
        )
        WITH CHECK (
          couple_id IS NOT NULL AND
          created_by_user_id = auth.uid() AND
          is_default = false
        )
    $policy$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'dare_prompts' AND policyname = 'Couple members can delete own dare prompts'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Couple members can delete own dare prompts"
        ON dare_prompts FOR DELETE
        TO authenticated
        USING (
          couple_id IS NOT NULL AND
          created_by_user_id = auth.uid() AND
          is_default = false
        )
    $policy$;
  END IF;
END $$;

-- ============================================================
-- COUPLE WRITE POLICIES — TELL ME PROMPTS
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'tell_me_prompts' AND policyname = 'Couple members can insert own tell me prompts'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Couple members can insert own tell me prompts"
        ON tell_me_prompts FOR INSERT
        TO authenticated
        WITH CHECK (
          couple_id IS NOT NULL AND
          created_by_user_id = auth.uid() AND
          is_default = false AND
          EXISTS (
            SELECT 1 FROM couples
            WHERE id = couple_id
            AND (user_a_id = auth.uid() OR user_b_id = auth.uid())
          )
        )
    $policy$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'tell_me_prompts' AND policyname = 'Couple members can update own tell me prompts'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Couple members can update own tell me prompts"
        ON tell_me_prompts FOR UPDATE
        TO authenticated
        USING (
          couple_id IS NOT NULL AND
          created_by_user_id = auth.uid() AND
          is_default = false
        )
        WITH CHECK (
          couple_id IS NOT NULL AND
          created_by_user_id = auth.uid() AND
          is_default = false
        )
    $policy$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'tell_me_prompts' AND policyname = 'Couple members can delete own tell me prompts'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Couple members can delete own tell me prompts"
        ON tell_me_prompts FOR DELETE
        TO authenticated
        USING (
          couple_id IS NOT NULL AND
          created_by_user_id = auth.uid() AND
          is_default = false
        )
    $policy$;
  END IF;
END $$;

-- ============================================================
-- NOTE TEMPLATES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS note_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id uuid REFERENCES couples(id) ON DELETE CASCADE,
  created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  text text NOT NULL,
  is_default boolean DEFAULT false,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE note_templates ENABLE ROW LEVEL SECURITY;

-- Seed default note templates
INSERT INTO note_templates (text, is_default, is_active, couple_id, created_by_user_id)
SELECT text, true, true, NULL, NULL
FROM (VALUES
  ('Thinking about you.'),
  ('Can''t wait to see you.'),
  ('You made my day.'),
  ('I have an idea for later.'),
  ('You''re my favorite person.'),
  ('Missing you right now.')
) AS t(text)
WHERE NOT EXISTS (
  SELECT 1 FROM note_templates WHERE is_default = true
);

-- READ: couple members see their own + all defaults
CREATE POLICY "Couple members can read own and default note templates"
  ON note_templates FOR SELECT
  TO authenticated
  USING (
    is_default = true
    OR (
      couple_id IS NOT NULL AND
      EXISTS (
        SELECT 1 FROM couples
        WHERE id = couple_id
        AND (user_a_id = auth.uid() OR user_b_id = auth.uid())
      )
    )
  );

-- INSERT: couple members can add their own
CREATE POLICY "Couple members can insert own note templates"
  ON note_templates FOR INSERT
  TO authenticated
  WITH CHECK (
    couple_id IS NOT NULL AND
    created_by_user_id = auth.uid() AND
    is_default = false AND
    EXISTS (
      SELECT 1 FROM couples
      WHERE id = couple_id
      AND (user_a_id = auth.uid() OR user_b_id = auth.uid())
    )
  );

-- UPDATE: couple members can update their own
CREATE POLICY "Couple members can update own note templates"
  ON note_templates FOR UPDATE
  TO authenticated
  USING (
    couple_id IS NOT NULL AND
    created_by_user_id = auth.uid() AND
    is_default = false
  )
  WITH CHECK (
    couple_id IS NOT NULL AND
    created_by_user_id = auth.uid() AND
    is_default = false
  );

-- DELETE: couple members can delete their own
CREATE POLICY "Couple members can delete own note templates"
  ON note_templates FOR DELETE
  TO authenticated
  USING (
    couple_id IS NOT NULL AND
    created_by_user_id = auth.uid() AND
    is_default = false
  );

-- ADMIN: full CRUD on defaults
CREATE POLICY "Admins can insert default note templates"
  ON note_templates FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = true)
  );

CREATE POLICY "Admins can update default note templates"
  ON note_templates FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = true)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = true)
  );

CREATE POLICY "Admins can delete default note templates"
  ON note_templates FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = true)
  );

-- Index for common query patterns
CREATE INDEX IF NOT EXISTS note_templates_couple_id_idx ON note_templates(couple_id);
CREATE INDEX IF NOT EXISTS note_templates_is_default_idx ON note_templates(is_default);
