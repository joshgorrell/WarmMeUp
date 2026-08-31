/*
  # Tighten vault_items UPDATE RLS policy

  ## Problem
  The existing UPDATE policy allowed either couple partner to modify privacy flags
  (allow_screenshot, allow_save, allow_share) on media uploaded by the other person.
  This means a partner could enable screenshotting or sharing on media they didn't upload.

  ## Fix
  Drop the permissive couple-wide UPDATE policy and replace it with two policies:
  1. Uploader can update their own items (all fields including privacy flags)
  2. Partner can only update viewed_by_partner (to mark as seen) — enforced by limiting
     what fields are changeable via a separate narrow policy on just that column scenario.

  Since PostgreSQL RLS doesn't support column-level restrictions in policies directly,
  we apply a single uploader-only UPDATE policy and handle the viewed_by_partner update
  through a separate security definer function.
*/

-- Drop the old permissive couple-wide UPDATE policy
DROP POLICY IF EXISTS "Couple members can update vault items" ON vault_items;

-- Only the uploader can modify their vault items (privacy settings, metadata)
CREATE POLICY "Uploader can update own vault items"
  ON vault_items FOR UPDATE
  TO authenticated
  USING (auth.uid() = uploaded_by_user_id)
  WITH CHECK (auth.uid() = uploaded_by_user_id);

-- Allow partners to mark vault items as viewed (security definer function bypasses RLS for this narrow op)
CREATE OR REPLACE FUNCTION mark_vault_item_viewed(item_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE vault_items
  SET viewed_by_partner = true
  WHERE id = item_id
    AND couple_id IN (
      SELECT id FROM couples
      WHERE (user_a_id = auth.uid() OR user_b_id = auth.uid())
      AND active = true
    )
    AND uploaded_by_user_id != auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION mark_vault_item_viewed(uuid) TO authenticated;
