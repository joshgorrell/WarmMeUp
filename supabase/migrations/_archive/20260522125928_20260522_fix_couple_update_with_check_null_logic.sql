/*
  # Fix couples UPDATE RLS WITH CHECK null-logic bug

  ## Summary
  The "Couple members can update their couple" policy had a self-pairing guard written as:

    NOT (auth.uid() = user_a_id AND user_b_id = auth.uid())

  This uses standard SQL three-valued logic. When user_b_id IS NULL (solo couple),
  `user_b_id = auth.uid()` evaluates to NULL rather than FALSE, which makes the entire
  NOT (...) expression NULL rather than TRUE. A WITH CHECK that evaluates to NULL is
  treated as a failure by Postgres RLS, so every legitimate update on a solo couple
  (including refreshing the invite code) was silently rejected with an RLS error.

  The fix rewrites the guard using IS DISTINCT FROM, which treats NULL as a distinct
  value and always returns TRUE or FALSE — never NULL.

  ## Changes

  ### couples table
  - Drop and recreate "Couple members can update their couple" UPDATE policy
  - Replace `user_b_id = auth.uid()` with `user_b_id IS NOT DISTINCT FROM auth.uid()`
    in the self-pairing guard, so `NOT (...)` correctly returns TRUE when user_b_id IS NULL

  ## Security
  - The self-pairing guard is preserved: a user who is user_a cannot set user_b_id to
    their own id (the only case that should be blocked)
  - Solo couple owners (user_a_id = auth.uid(), user_b_id IS NULL) can now update their
    couple row (e.g. refresh invite code, update invite_code_expires_at)
  - Paired couple members (either user_a or user_b) can still update shared couple fields
*/

DROP POLICY IF EXISTS "Couple members can update their couple" ON couples;

CREATE POLICY "Couple members can update their couple"
  ON couples FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_a_id OR auth.uid() = user_b_id)
  WITH CHECK (
    (auth.uid() = user_a_id OR auth.uid() = user_b_id)
    AND NOT (auth.uid() = user_a_id AND user_b_id IS NOT DISTINCT FROM auth.uid())
  );
