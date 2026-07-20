/*
# Fix delete policies for couple-scoped burn/clear operations

## Problem
Two tables had broken DELETE policies that prevented "burn it all" and
"delete content" from fully removing data for both partners:

1. `vault_items` DELETE policy only allowed the uploader (`auth.uid() =
   uploaded_by_user_id`) to delete. When one partner ran "burn it all" or
   "delete vault", the other partner's uploaded vault items survived because
   the DELETE was blocked by RLS.
2. `cash_in_events` had NO DELETE policy at all. The `burnItAll` and
   `deletePointsAndStreaks` functions call `.delete().eq('couple_id', …)` on
   this table, but without a DELETE policy, zero rows are ever deleted.

## Fix
1. Replace the `vault_items` DELETE policy with a couple-scoped one: any
   couple member can delete any vault item in their couple.
2. Add a `cash_in_events` DELETE policy scoped to couple members.

## Security
- Both policies require `couple_id IN (SELECT couples.id FROM couples WHERE
  user_a_id = auth.uid() OR user_b_id = auth.uid())` — no cross-couple access.
- `TO authenticated` only.
- No columns, types, or tables changed.
*/

-- vault_items: allow any couple member to delete (not just uploader)
DROP POLICY IF EXISTS "Uploader can delete vault items" ON vault_items;
DROP POLICY IF EXISTS "Couple members can delete vault items" ON vault_items;
CREATE POLICY "Couple members can delete vault items"
ON vault_items FOR DELETE
TO authenticated
USING (
  couple_id IN (
    SELECT couples.id FROM couples
    WHERE couples.user_a_id = auth.uid() OR couples.user_b_id = auth.uid()
  )
);

-- cash_in_events: add missing DELETE policy for couple members
DROP POLICY IF EXISTS "Couple members can delete cash in events" ON cash_in_events;
CREATE POLICY "Couple members can delete cash in events"
ON cash_in_events FOR DELETE
TO authenticated
USING (
  couple_id IN (
    SELECT couples.id FROM couples
    WHERE couples.user_a_id = auth.uid() OR couples.user_b_id = auth.uid()
  )
);
