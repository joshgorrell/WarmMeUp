/*
  # Warmup App - Complete Database Schema

  ## Overview
  Private couples app for playful, romantic interaction between exactly two connected partners.

  ## Tables Created
  1. `profiles` - Extended user profiles linked to auth.users
  2. `couples` - Connects two users as a couple with invite code system
  3. `user_settings` - Per-user privacy, notification, and app settings
  4. `dice_prompts` - Dice roll result prompts (default + custom)
  5. `dare_prompts` - Dare prompts (default + custom)
  6. `tell_me_prompts` - Tell Me question prompts (default + custom)
  7. `interactions` - All ephemeral interactions (dice, dare, tell_me, note, media)
  8. `vault_items` - Private media vault entries
  9. `scores` - Rolling point totals per user per couple
  10. `point_events` - Audit log of all point awards
  11. `cash_in_events` - History of Cash In redemptions

  ## Security
  - RLS enabled on all tables
  - Users can only access data for their own couple
*/

-- ============================================================
-- PROFILES
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL DEFAULT '',
  avatar_url text,
  push_token text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- ============================================================
-- COUPLES
-- ============================================================
CREATE TABLE IF NOT EXISTS couples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_b_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  invite_code text UNIQUE NOT NULL,
  active boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE couples ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Couple members can view their couple"
  ON couples FOR SELECT
  TO authenticated
  USING (auth.uid() = user_a_id OR auth.uid() = user_b_id);

CREATE POLICY "User can create couple as user_a"
  ON couples FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_a_id);

CREATE POLICY "Couple members can update their couple"
  ON couples FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_a_id OR auth.uid() = user_b_id)
  WITH CHECK (auth.uid() = user_a_id OR auth.uid() = user_b_id);

-- Allow anyone to read invite codes for joining
CREATE POLICY "Anyone can lookup couple by invite code for joining"
  ON couples FOR SELECT
  TO anon
  USING (invite_code IS NOT NULL);

-- ============================================================
-- USER SETTINGS
-- ============================================================
CREATE TABLE IF NOT EXISTS user_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  stealth_mode_enabled boolean DEFAULT true,
  stealth_bypass_until timestamptz,
  face_id_required boolean DEFAULT true,
  vault_face_id_required boolean DEFAULT true,
  blur_on_background boolean DEFAULT true,
  discreet_notifications boolean DEFAULT true,
  notification_copy text DEFAULT 'New activity in Warmup',
  vault_allow_screenshot_default boolean DEFAULT false,
  vault_allow_save_default boolean DEFAULT false,
  vault_allow_share_default boolean DEFAULT false,
  screenshot_notify_partner boolean DEFAULT true,
  theme text DEFAULT 'dark',
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own settings"
  ON user_settings FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own settings"
  ON user_settings FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own settings"
  ON user_settings FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- DICE PROMPTS
-- ============================================================
CREATE TABLE IF NOT EXISTS dice_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id uuid REFERENCES couples(id) ON DELETE CASCADE,
  created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  text text NOT NULL,
  category text DEFAULT 'general',
  is_default boolean DEFAULT false,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE dice_prompts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Couple members can view their dice prompts"
  ON dice_prompts FOR SELECT
  TO authenticated
  USING (
    couple_id IN (
      SELECT id FROM couples WHERE user_a_id = auth.uid() OR user_b_id = auth.uid()
    )
    OR is_default = true
  );

CREATE POLICY "Couple members can insert dice prompts"
  ON dice_prompts FOR INSERT
  TO authenticated
  WITH CHECK (
    couple_id IN (
      SELECT id FROM couples WHERE user_a_id = auth.uid() OR user_b_id = auth.uid()
    )
  );

CREATE POLICY "Couple members can update dice prompts"
  ON dice_prompts FOR UPDATE
  TO authenticated
  USING (
    couple_id IN (
      SELECT id FROM couples WHERE user_a_id = auth.uid() OR user_b_id = auth.uid()
    )
  )
  WITH CHECK (
    couple_id IN (
      SELECT id FROM couples WHERE user_a_id = auth.uid() OR user_b_id = auth.uid()
    )
  );

CREATE POLICY "Couple members can delete dice prompts"
  ON dice_prompts FOR DELETE
  TO authenticated
  USING (
    couple_id IN (
      SELECT id FROM couples WHERE user_a_id = auth.uid() OR user_b_id = auth.uid()
    )
  );

-- ============================================================
-- DARE PROMPTS
-- ============================================================
CREATE TABLE IF NOT EXISTS dare_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id uuid REFERENCES couples(id) ON DELETE CASCADE,
  created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  text text NOT NULL,
  is_default boolean DEFAULT false,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE dare_prompts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Couple members can view dare prompts"
  ON dare_prompts FOR SELECT
  TO authenticated
  USING (
    couple_id IN (
      SELECT id FROM couples WHERE user_a_id = auth.uid() OR user_b_id = auth.uid()
    )
    OR is_default = true
  );

CREATE POLICY "Couple members can insert dare prompts"
  ON dare_prompts FOR INSERT
  TO authenticated
  WITH CHECK (
    couple_id IN (
      SELECT id FROM couples WHERE user_a_id = auth.uid() OR user_b_id = auth.uid()
    )
  );

CREATE POLICY "Couple members can update dare prompts"
  ON dare_prompts FOR UPDATE
  TO authenticated
  USING (
    couple_id IN (
      SELECT id FROM couples WHERE user_a_id = auth.uid() OR user_b_id = auth.uid()
    )
  )
  WITH CHECK (
    couple_id IN (
      SELECT id FROM couples WHERE user_a_id = auth.uid() OR user_b_id = auth.uid()
    )
  );

CREATE POLICY "Couple members can delete dare prompts"
  ON dare_prompts FOR DELETE
  TO authenticated
  USING (
    couple_id IN (
      SELECT id FROM couples WHERE user_a_id = auth.uid() OR user_b_id = auth.uid()
    )
  );

-- ============================================================
-- TELL ME PROMPTS
-- ============================================================
CREATE TABLE IF NOT EXISTS tell_me_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id uuid REFERENCES couples(id) ON DELETE CASCADE,
  created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  text text NOT NULL,
  is_default boolean DEFAULT false,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE tell_me_prompts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Couple members can view tell me prompts"
  ON tell_me_prompts FOR SELECT
  TO authenticated
  USING (
    couple_id IN (
      SELECT id FROM couples WHERE user_a_id = auth.uid() OR user_b_id = auth.uid()
    )
    OR is_default = true
  );

CREATE POLICY "Couple members can insert tell me prompts"
  ON tell_me_prompts FOR INSERT
  TO authenticated
  WITH CHECK (
    couple_id IN (
      SELECT id FROM couples WHERE user_a_id = auth.uid() OR user_b_id = auth.uid()
    )
  );

CREATE POLICY "Couple members can update tell me prompts"
  ON tell_me_prompts FOR UPDATE
  TO authenticated
  USING (
    couple_id IN (
      SELECT id FROM couples WHERE user_a_id = auth.uid() OR user_b_id = auth.uid()
    )
  )
  WITH CHECK (
    couple_id IN (
      SELECT id FROM couples WHERE user_a_id = auth.uid() OR user_b_id = auth.uid()
    )
  );

CREATE POLICY "Couple members can delete tell me prompts"
  ON tell_me_prompts FOR DELETE
  TO authenticated
  USING (
    couple_id IN (
      SELECT id FROM couples WHERE user_a_id = auth.uid() OR user_b_id = auth.uid()
    )
  );

-- ============================================================
-- INTERACTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id uuid NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('dice', 'dare', 'tell_me', 'note', 'media')),
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  receiver_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content_text text,
  prompt_id uuid,
  mode text CHECK (mode IN ('tell_me', 'text_me', 'verbal', 'typed')),
  status text DEFAULT 'sent' CHECK (status IN ('sent', 'seen', 'accepted', 'rejected', 'completed', 'answered')),
  is_active boolean DEFAULT true,
  points_awarded integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz
);

ALTER TABLE interactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Couple members can view their interactions"
  ON interactions FOR SELECT
  TO authenticated
  USING (
    couple_id IN (
      SELECT id FROM couples WHERE user_a_id = auth.uid() OR user_b_id = auth.uid()
    )
  );

CREATE POLICY "Couple members can insert interactions"
  ON interactions FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = sender_id
    AND couple_id IN (
      SELECT id FROM couples WHERE user_a_id = auth.uid() OR user_b_id = auth.uid()
    )
  );

CREATE POLICY "Couple members can update interactions"
  ON interactions FOR UPDATE
  TO authenticated
  USING (
    couple_id IN (
      SELECT id FROM couples WHERE user_a_id = auth.uid() OR user_b_id = auth.uid()
    )
  )
  WITH CHECK (
    couple_id IN (
      SELECT id FROM couples WHERE user_a_id = auth.uid() OR user_b_id = auth.uid()
    )
  );

-- ============================================================
-- VAULT ITEMS
-- ============================================================
CREATE TABLE IF NOT EXISTS vault_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id uuid NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  uploaded_by_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  media_type text NOT NULL CHECK (media_type IN ('photo', 'video')),
  file_path text NOT NULL,
  blurred_thumbnail_path text,
  allow_screenshot boolean DEFAULT false,
  allow_save boolean DEFAULT false,
  allow_share boolean DEFAULT false,
  screenshot_detected boolean DEFAULT false,
  viewed_by_partner boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz
);

ALTER TABLE vault_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Couple members can view vault items"
  ON vault_items FOR SELECT
  TO authenticated
  USING (
    couple_id IN (
      SELECT id FROM couples WHERE user_a_id = auth.uid() OR user_b_id = auth.uid()
    )
  );

CREATE POLICY "Couple members can insert vault items"
  ON vault_items FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = uploaded_by_user_id
    AND couple_id IN (
      SELECT id FROM couples WHERE user_a_id = auth.uid() OR user_b_id = auth.uid()
    )
  );

CREATE POLICY "Couple members can update vault items"
  ON vault_items FOR UPDATE
  TO authenticated
  USING (
    couple_id IN (
      SELECT id FROM couples WHERE user_a_id = auth.uid() OR user_b_id = auth.uid()
    )
  )
  WITH CHECK (
    couple_id IN (
      SELECT id FROM couples WHERE user_a_id = auth.uid() OR user_b_id = auth.uid()
    )
  );

CREATE POLICY "Uploader can delete vault items"
  ON vault_items FOR DELETE
  TO authenticated
  USING (auth.uid() = uploaded_by_user_id);

-- ============================================================
-- SCORES
-- ============================================================
CREATE TABLE IF NOT EXISTS scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id uuid NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  points integer DEFAULT 0,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(couple_id, user_id)
);

ALTER TABLE scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Couple members can view scores"
  ON scores FOR SELECT
  TO authenticated
  USING (
    couple_id IN (
      SELECT id FROM couples WHERE user_a_id = auth.uid() OR user_b_id = auth.uid()
    )
  );

CREATE POLICY "Couple members can insert scores"
  ON scores FOR INSERT
  TO authenticated
  WITH CHECK (
    couple_id IN (
      SELECT id FROM couples WHERE user_a_id = auth.uid() OR user_b_id = auth.uid()
    )
  );

CREATE POLICY "Couple members can update scores"
  ON scores FOR UPDATE
  TO authenticated
  USING (
    couple_id IN (
      SELECT id FROM couples WHERE user_a_id = auth.uid() OR user_b_id = auth.uid()
    )
  )
  WITH CHECK (
    couple_id IN (
      SELECT id FROM couples WHERE user_a_id = auth.uid() OR user_b_id = auth.uid()
    )
  );

-- ============================================================
-- POINT EVENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS point_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id uuid NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  interaction_id uuid REFERENCES interactions(id) ON DELETE SET NULL,
  points integer NOT NULL,
  reason text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE point_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Couple members can view point events"
  ON point_events FOR SELECT
  TO authenticated
  USING (
    couple_id IN (
      SELECT id FROM couples WHERE user_a_id = auth.uid() OR user_b_id = auth.uid()
    )
  );

CREATE POLICY "Couple members can insert point events"
  ON point_events FOR INSERT
  TO authenticated
  WITH CHECK (
    couple_id IN (
      SELECT id FROM couples WHERE user_a_id = auth.uid() OR user_b_id = auth.uid()
    )
  );

-- ============================================================
-- CASH IN EVENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS cash_in_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id uuid NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  winner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  loser_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  winner_choice text NOT NULL CHECK (winner_choice IN ('give', 'receive')),
  winner_points integer NOT NULL DEFAULT 0,
  loser_points integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE cash_in_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Couple members can view cash in events"
  ON cash_in_events FOR SELECT
  TO authenticated
  USING (
    couple_id IN (
      SELECT id FROM couples WHERE user_a_id = auth.uid() OR user_b_id = auth.uid()
    )
  );

CREATE POLICY "Couple members can insert cash in events"
  ON cash_in_events FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = winner_user_id
    AND couple_id IN (
      SELECT id FROM couples WHERE user_a_id = auth.uid() OR user_b_id = auth.uid()
    )
  );

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_couples_user_a ON couples(user_a_id);
CREATE INDEX IF NOT EXISTS idx_couples_user_b ON couples(user_b_id);
CREATE INDEX IF NOT EXISTS idx_couples_invite_code ON couples(invite_code);
CREATE INDEX IF NOT EXISTS idx_interactions_couple ON interactions(couple_id);
CREATE INDEX IF NOT EXISTS idx_interactions_active ON interactions(couple_id, is_active);
CREATE INDEX IF NOT EXISTS idx_vault_items_couple ON vault_items(couple_id);
CREATE INDEX IF NOT EXISTS idx_scores_couple ON scores(couple_id);
CREATE INDEX IF NOT EXISTS idx_point_events_couple ON point_events(couple_id);
CREATE INDEX IF NOT EXISTS idx_cash_in_events_couple ON cash_in_events(couple_id);

-- ============================================================
-- ENABLE REALTIME
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE interactions;
ALTER PUBLICATION supabase_realtime ADD TABLE vault_items;
ALTER PUBLICATION supabase_realtime ADD TABLE scores;
ALTER PUBLICATION supabase_realtime ADD TABLE cash_in_events;
