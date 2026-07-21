/*
  # Admin Panel Setup

  ## Overview
  Adds admin capabilities to the app and seeds default prompts into the database.

  ## Changes

  ### 1. Modified Tables
  - `profiles`: Added `is_admin` boolean column (default false)
  - `couples`: Added `admin_notes` text column for internal notes

  ### 2. New RLS Policies
  - Admins can read all profiles
  - Admins can read all couples
  - Admins can update any couple (for deactivation)
  - Admins can insert/update/delete default prompts (dice, dare, tell_me)

  ### 3. Seeded Data
  - 15 default dice prompts
  - 10 default dare prompts
  - 9 default tell me prompts

  ## Notes
  - is_admin defaults to false; must be set manually in Supabase dashboard for the app owner
  - Default prompts have couple_id = NULL (global defaults visible to all users)
*/

-- ============================================================
-- ADD ADMIN FIELD TO PROFILES
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'is_admin'
  ) THEN
    ALTER TABLE profiles ADD COLUMN is_admin boolean DEFAULT false;
  END IF;
END $$;

-- ============================================================
-- ADD ADMIN NOTES TO COUPLES
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'couples' AND column_name = 'admin_notes'
  ) THEN
    ALTER TABLE couples ADD COLUMN admin_notes text DEFAULT '';
  END IF;
END $$;

-- ============================================================
-- ADMIN RLS POLICIES - PROFILES
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Admins can read all profiles'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Admins can read all profiles"
        ON profiles FOR SELECT
        TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = true
          )
        )
    $policy$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Admins can update any profile'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Admins can update any profile"
        ON profiles FOR UPDATE
        TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = true
          )
        )
        WITH CHECK (
          EXISTS (
            SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = true
          )
        )
    $policy$;
  END IF;
END $$;

-- ============================================================
-- ADMIN RLS POLICIES - COUPLES
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'couples' AND policyname = 'Admins can read all couples'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Admins can read all couples"
        ON couples FOR SELECT
        TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = true
          )
        )
    $policy$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'couples' AND policyname = 'Admins can update any couple'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Admins can update any couple"
        ON couples FOR UPDATE
        TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = true
          )
        )
        WITH CHECK (
          EXISTS (
            SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = true
          )
        )
    $policy$;
  END IF;
END $$;

-- ============================================================
-- ADMIN RLS POLICIES - INTERACTIONS (read all)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'interactions' AND policyname = 'Admins can read all interactions'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Admins can read all interactions"
        ON interactions FOR SELECT
        TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = true
          )
        )
    $policy$;
  END IF;
END $$;

-- ============================================================
-- ADMIN RLS POLICIES - SCORES (read all)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'scores' AND policyname = 'Admins can read all scores'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Admins can read all scores"
        ON scores FOR SELECT
        TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = true
          )
        )
    $policy$;
  END IF;
END $$;

-- ============================================================
-- ADMIN RLS POLICIES - DICE PROMPTS (full CRUD on defaults)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'dice_prompts' AND policyname = 'Admins can insert default dice prompts'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Admins can insert default dice prompts"
        ON dice_prompts FOR INSERT
        TO authenticated
        WITH CHECK (
          EXISTS (
            SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = true
          )
        )
    $policy$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'dice_prompts' AND policyname = 'Admins can update default dice prompts'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Admins can update default dice prompts"
        ON dice_prompts FOR UPDATE
        TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = true
          )
        )
        WITH CHECK (
          EXISTS (
            SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = true
          )
        )
    $policy$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'dice_prompts' AND policyname = 'Admins can delete default dice prompts'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Admins can delete default dice prompts"
        ON dice_prompts FOR DELETE
        TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = true
          )
        )
    $policy$;
  END IF;
END $$;

-- ============================================================
-- ADMIN RLS POLICIES - DARE PROMPTS (full CRUD on defaults)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'dare_prompts' AND policyname = 'Admins can insert default dare prompts'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Admins can insert default dare prompts"
        ON dare_prompts FOR INSERT
        TO authenticated
        WITH CHECK (
          EXISTS (
            SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = true
          )
        )
    $policy$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'dare_prompts' AND policyname = 'Admins can update default dare prompts'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Admins can update default dare prompts"
        ON dare_prompts FOR UPDATE
        TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = true
          )
        )
        WITH CHECK (
          EXISTS (
            SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = true
          )
        )
    $policy$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'dare_prompts' AND policyname = 'Admins can delete default dare prompts'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Admins can delete default dare prompts"
        ON dare_prompts FOR DELETE
        TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = true
          )
        )
    $policy$;
  END IF;
END $$;

-- ============================================================
-- ADMIN RLS POLICIES - TELL ME PROMPTS (full CRUD on defaults)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'tell_me_prompts' AND policyname = 'Admins can insert default tell me prompts'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Admins can insert default tell me prompts"
        ON tell_me_prompts FOR INSERT
        TO authenticated
        WITH CHECK (
          EXISTS (
            SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = true
          )
        )
    $policy$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'tell_me_prompts' AND policyname = 'Admins can update default tell me prompts'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Admins can update default tell me prompts"
        ON tell_me_prompts FOR UPDATE
        TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = true
          )
        )
        WITH CHECK (
          EXISTS (
            SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = true
          )
        )
    $policy$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'tell_me_prompts' AND policyname = 'Admins can delete default tell me prompts'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Admins can delete default tell me prompts"
        ON tell_me_prompts FOR DELETE
        TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = true
          )
        )
    $policy$;
  END IF;
END $$;

-- ============================================================
-- SEED DEFAULT DICE PROMPTS
-- ============================================================
INSERT INTO dice_prompts (text, category, is_default, is_active, couple_id, created_by_user_id)
SELECT text, 'general', true, true, NULL, NULL
FROM (VALUES
  ('Send a playful note'),
  ('Ask them what they want'),
  ('Send a Dare'),
  ('Tell them something you like about them'),
  ('Share a private memory'),
  ('Send a Vault surprise'),
  ('Ask them to choose Give or Receive'),
  ('Tell them a secret'),
  ('Let them make the next move'),
  ('Send something sweet'),
  ('Challenge accepted?'),
  ('Make them smile'),
  ('Say what you''re thinking'),
  ('Plan something for later'),
  ('Roll again')
) AS t(text)
WHERE NOT EXISTS (
  SELECT 1 FROM dice_prompts WHERE is_default = true
);

-- ============================================================
-- SEED DEFAULT DARE PROMPTS
-- ============================================================
INSERT INTO dare_prompts (text, is_default, is_active, couple_id, created_by_user_id)
SELECT text, true, true, NULL, NULL
FROM (VALUES
  ('Say what you want without explaining it'),
  ('Send me a look'),
  ('Tell me exactly what you''re thinking'),
  ('Make me laugh right now'),
  ('Give me a compliment I''ll remember'),
  ('Ask me anything'),
  ('Pick the next move'),
  ('Tell me what happens next'),
  ('Surprise me'),
  ('Your choice')
) AS t(text)
WHERE NOT EXISTS (
  SELECT 1 FROM dare_prompts WHERE is_default = true
);

-- ============================================================
-- SEED DEFAULT TELL ME PROMPTS
-- ============================================================
INSERT INTO tell_me_prompts (text, is_default, is_active, couple_id, created_by_user_id)
SELECT text, true, true, NULL, NULL
FROM (VALUES
  ('Tell me something you''ve never told me'),
  ('Tell me what you want'),
  ('Tell me what you''re thinking right now'),
  ('Tell me your favorite memory of us'),
  ('Tell me something bold'),
  ('Tell me what you want later'),
  ('Tell me something sweet'),
  ('Tell me something I don''t know'),
  ('Tell me a secret')
) AS t(text)
WHERE NOT EXISTS (
  SELECT 1 FROM tell_me_prompts WHERE is_default = true
);
