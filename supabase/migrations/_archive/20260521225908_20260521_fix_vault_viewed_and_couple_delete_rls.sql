/*
  # Fix vault_items viewed RLS policy and couples DELETE policy

  ## Summary
  Two RLS policies became stale after the `couples.active` semantics changed
  (migration 20260520202602 made all solo couples active = true):

  1. **vault_items "Partner can mark vault item as viewed"** — contained a
     `couples.active = true` guard that is now redundant and inconsistent with
     the SECURITY DEFINER `mark_vault_item_viewed()` function (which has no
     active check). Left as-is it would silently block partners from marking
     items viewed on inactive/disconnected couples.

  2. **couples "Creator can delete their own pending invite"** — required
     `active = false` to allow the row deletion. Since solo couples are now
     `active = true` by default, the cancel-invite button can never work for
     new users. The correct guard is `user_b_id IS NULL` (no partner has joined).

  ## Changes

  ### vault_items
  - Drop "Partner can mark vault item as viewed" UPDATE policy
  - Recreate it without the `couples.active = true` condition

  ### couples
  - Drop "Creator can delete their own pending invite" DELETE policy
  - Recreate it using `user_b_id IS NULL` instead of `active = false`

  ## Security
  - vault_items: partners can still only mark items from their own couple as viewed;
    the couple membership check is preserved
  - couples: only the creator (user_a_id) can delete a couple that has no partner
    yet; once a partner joins (user_b_id IS NOT NULL) the row cannot be deleted
    via this policy
*/

-- ─── Fix vault_items "Partner can mark vault item as viewed" ────────────────
DROP POLICY IF EXISTS "Partner can mark vault item as viewed" ON vault_items;

CREATE POLICY "Partner can mark vault item as viewed"
  ON vault_items FOR UPDATE
  TO authenticated
  USING (
    uploaded_by_user_id <> auth.uid()
    AND couple_id IN (
      SELECT id FROM couples
      WHERE (user_a_id = auth.uid() OR user_b_id = auth.uid())
    )
  )
  WITH CHECK (
    uploaded_by_user_id <> auth.uid()
    AND couple_id IN (
      SELECT id FROM couples
      WHERE (user_a_id = auth.uid() OR user_b_id = auth.uid())
    )
  );

-- ─── Fix couples DELETE policy ───────────────────────────────────────────────
DROP POLICY IF EXISTS "Creator can delete their own pending invite" ON couples;

CREATE POLICY "Creator can delete their own pending invite"
  ON couples FOR DELETE
  TO authenticated
  USING (auth.uid() = user_a_id AND user_b_id IS NULL);
