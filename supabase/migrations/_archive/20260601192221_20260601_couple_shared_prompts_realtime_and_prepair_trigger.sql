/*
  # Couple-Shared Custom Prompts — Realtime + Pre-Pairing

  ## Summary
  Makes all custom prompts (dice, dare, tell_me, decline) fully shared between both
  partners of a couple in real time.

  ## Changes

  ### 1. Realtime Publication
  Adds dice_prompts, dare_prompts, tell_me_prompts, and decline_prompts to the
  Supabase realtime publication so both partners receive live INSERT/UPDATE/DELETE
  events without polling.

  ### 2. RLS Policy Updates — dice_prompts, dare_prompts, tell_me_prompts
  Drops the old UPDATE and DELETE couple policies that required
  `created_by_user_id = auth.uid()` (blocking a partner from editing the other
  partner's prompts) and replaces them with policies that only require
  couple membership.
  - INSERT still requires `created_by_user_id = auth.uid()` (attribution)
  - UPDATE and DELETE require only `couple_id IN user's couples`

  ### 3. Pre-Pairing Prompt Migration Trigger
  When the second user joins a couple (user_b_id transitions NULL → a real UUID),
  a trigger function `migrate_solo_prompts_to_couple()` updates all prompt rows
  where `created_by_user_id = user_a_id` and `couple_id IS NULL` to set
  `couple_id = the new couple id`. This makes prompts created before pairing
  immediately visible to the partner.

  ## Security
  - All policies remain restricted to authenticated users and active couple members
  - Admin policies are unchanged
  - decline_prompts policies already used couple membership (not creator check) —
    no change needed there
*/

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Enable Realtime on all prompt tables
-- ─────────────────────────────────────────────────────────────────────────────

ALTER PUBLICATION supabase_realtime ADD TABLE dice_prompts;
ALTER PUBLICATION supabase_realtime ADD TABLE dare_prompts;
ALTER PUBLICATION supabase_realtime ADD TABLE tell_me_prompts;
ALTER PUBLICATION supabase_realtime ADD TABLE decline_prompts;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. dice_prompts — Update & Delete: couple membership only (drop creator check)
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Couple members can update own dice prompts" ON dice_prompts;
DROP POLICY IF EXISTS "Couple members can delete own dice prompts" ON dice_prompts;

CREATE POLICY "Couple members can update their couple dice prompts"
  ON dice_prompts FOR UPDATE
  TO authenticated
  USING (
    is_default = false
    AND couple_id IS NOT NULL
    AND couple_id IN (
      SELECT id FROM couples
      WHERE (user_a_id = auth.uid() OR user_b_id = auth.uid())
        AND active = true
    )
  )
  WITH CHECK (
    is_default = false
    AND couple_id IS NOT NULL
    AND couple_id IN (
      SELECT id FROM couples
      WHERE (user_a_id = auth.uid() OR user_b_id = auth.uid())
        AND active = true
    )
  );

CREATE POLICY "Couple members can delete their couple dice prompts"
  ON dice_prompts FOR DELETE
  TO authenticated
  USING (
    is_default = false
    AND couple_id IS NOT NULL
    AND couple_id IN (
      SELECT id FROM couples
      WHERE (user_a_id = auth.uid() OR user_b_id = auth.uid())
        AND active = true
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. dare_prompts — Update & Delete: couple membership only
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Couple members can update own dare prompts" ON dare_prompts;
DROP POLICY IF EXISTS "Couple members can delete own dare prompts" ON dare_prompts;

CREATE POLICY "Couple members can update their couple dare prompts"
  ON dare_prompts FOR UPDATE
  TO authenticated
  USING (
    is_default = false
    AND couple_id IS NOT NULL
    AND couple_id IN (
      SELECT id FROM couples
      WHERE (user_a_id = auth.uid() OR user_b_id = auth.uid())
        AND active = true
    )
  )
  WITH CHECK (
    is_default = false
    AND couple_id IS NOT NULL
    AND couple_id IN (
      SELECT id FROM couples
      WHERE (user_a_id = auth.uid() OR user_b_id = auth.uid())
        AND active = true
    )
  );

CREATE POLICY "Couple members can delete their couple dare prompts"
  ON dare_prompts FOR DELETE
  TO authenticated
  USING (
    is_default = false
    AND couple_id IS NOT NULL
    AND couple_id IN (
      SELECT id FROM couples
      WHERE (user_a_id = auth.uid() OR user_b_id = auth.uid())
        AND active = true
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. tell_me_prompts — Update & Delete: couple membership only
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Couple members can update own tell me prompts" ON tell_me_prompts;
DROP POLICY IF EXISTS "Couple members can delete own tell me prompts" ON tell_me_prompts;

CREATE POLICY "Couple members can update their couple tell me prompts"
  ON tell_me_prompts FOR UPDATE
  TO authenticated
  USING (
    is_default = false
    AND couple_id IS NOT NULL
    AND couple_id IN (
      SELECT id FROM couples
      WHERE (user_a_id = auth.uid() OR user_b_id = auth.uid())
        AND active = true
    )
  )
  WITH CHECK (
    is_default = false
    AND couple_id IS NOT NULL
    AND couple_id IN (
      SELECT id FROM couples
      WHERE (user_a_id = auth.uid() OR user_b_id = auth.uid())
        AND active = true
    )
  );

CREATE POLICY "Couple members can delete their couple tell me prompts"
  ON tell_me_prompts FOR DELETE
  TO authenticated
  USING (
    is_default = false
    AND couple_id IS NOT NULL
    AND couple_id IN (
      SELECT id FROM couples
      WHERE (user_a_id = auth.uid() OR user_b_id = auth.uid())
        AND active = true
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Pre-pairing prompt migration trigger
--    When user_b joins (user_b_id changes from NULL to a UUID), migrate all
--    prompts created by user_a with couple_id IS NULL to the couple.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION migrate_solo_prompts_to_couple()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only fire when user_b_id transitions from NULL to a real UUID
  IF OLD.user_b_id IS NULL AND NEW.user_b_id IS NOT NULL THEN
    UPDATE dice_prompts
      SET couple_id = NEW.id
      WHERE created_by_user_id = NEW.user_a_id
        AND couple_id IS NULL
        AND is_default = false;

    UPDATE dare_prompts
      SET couple_id = NEW.id
      WHERE created_by_user_id = NEW.user_a_id
        AND couple_id IS NULL
        AND is_default = false;

    UPDATE tell_me_prompts
      SET couple_id = NEW.id
      WHERE created_by_user_id = NEW.user_a_id
        AND couple_id IS NULL
        AND is_default = false;

    UPDATE decline_prompts
      SET couple_id = NEW.id
      WHERE created_by_user_id = NEW.user_a_id
        AND couple_id IS NULL
        AND is_default = false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_partner_joined_migrate_prompts ON couples;

CREATE TRIGGER on_partner_joined_migrate_prompts
  AFTER UPDATE OF user_b_id ON couples
  FOR EACH ROW
  EXECUTE FUNCTION migrate_solo_prompts_to_couple();
