/*
# Harden reaction RLS for cross-couple isolation

## Purpose
Ensure reactions (emoji reactions on chat/vault media and wishes) can never
cross-pollinate between couples. Previously, INSERT/UPDATE/DELETE policies on
`media_reactions` and UPDATE/DELETE policies on `wish_reactions` only checked
that the acting user owned the reaction row (`user_id = auth.uid()`), without
verifying that the `couple_id` (or the wish's `couple_id`) actually belongs to
the acting user. A user who left a couple, or a malicious authenticated user,
could insert or modify reactions on another couple's media/wishes.

## Changes

### media_reactions
1. INSERT — replace `WITH CHECK (auth.uid() = user_id)` with a policy that
   ALSO requires `couple_id` to belong to the acting user's couple.
2. UPDATE — replace `USING/CHECK (auth.uid() = user_id)` with a policy that
   requires couple membership (via `couple_id`) AND ownership.
3. DELETE — replace `USING (auth.uid() = user_id)` with a policy that
   requires couple membership (via `couple_id`) AND ownership.

### wish_reactions
1. UPDATE — replace `USING/CHECK (user_id = auth.uid())` with a policy that
   requires the wish's `couple_id` to belong to the acting user AND ownership.
2. DELETE — replace `USING (user_id = auth.uid())` with a policy that
   requires the wish's `couple_id` to belong to the acting user AND ownership.

## Security
- All policies remain `TO authenticated`.
- SELECT policies are unchanged (already couple-scoped).
- No columns, types, or tables are changed — only RLS policies.
- All policies are dropped before re-creation to stay idempotent.
*/

-- ── media_reactions ────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users can insert own media reactions" ON media_reactions;
CREATE POLICY "Couple members can insert own media reactions"
ON media_reactions FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND couple_id IN (
    SELECT couples.id FROM couples
    WHERE couples.user_a_id = auth.uid() OR couples.user_b_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Users can update own media reactions" ON media_reactions;
CREATE POLICY "Couple members can update own media reactions"
ON media_reactions FOR UPDATE
TO authenticated
USING (
  auth.uid() = user_id
  AND couple_id IN (
    SELECT couples.id FROM couples
    WHERE couples.user_a_id = auth.uid() OR couples.user_b_id = auth.uid()
  )
)
WITH CHECK (
  auth.uid() = user_id
  AND couple_id IN (
    SELECT couples.id FROM couples
    WHERE couples.user_a_id = auth.uid() OR couples.user_b_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Users can delete own media reactions" ON media_reactions;
CREATE POLICY "Couple members can delete own media reactions"
ON media_reactions FOR DELETE
TO authenticated
USING (
  auth.uid() = user_id
  AND couple_id IN (
    SELECT couples.id FROM couples
    WHERE couples.user_a_id = auth.uid() OR couples.user_b_id = auth.uid()
  )
);

-- ── wish_reactions ─────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users can update own wish reactions" ON wish_reactions;
CREATE POLICY "Couple members can update own wish reactions"
ON wish_reactions FOR UPDATE
TO authenticated
USING (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM wishes w
    JOIN couples c ON c.id = w.couple_id
    WHERE w.id = wish_reactions.wish_id
      AND (c.user_a_id = auth.uid() OR c.user_b_id = auth.uid())
  )
)
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM wishes w
    JOIN couples c ON c.id = w.couple_id
    WHERE w.id = wish_reactions.wish_id
      AND (c.user_a_id = auth.uid() OR c.user_b_id = auth.uid())
  )
);

DROP POLICY IF EXISTS "Users can delete own wish reactions" ON wish_reactions;
CREATE POLICY "Couple members can delete own wish reactions"
ON wish_reactions FOR DELETE
TO authenticated
USING (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM wishes w
    JOIN couples c ON c.id = w.couple_id
    WHERE w.id = wish_reactions.wish_id
      AND (c.user_a_id = auth.uid() OR c.user_b_id = auth.uid())
  )
);
