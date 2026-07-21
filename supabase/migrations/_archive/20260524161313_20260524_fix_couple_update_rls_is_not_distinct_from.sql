/*
  # Fix couples UPDATE RLS WITH CHECK — IS NOT DISTINCT FROM

  ## Problem
  The live "Couple members can update their couple" policy has a WITH CHECK that uses:

    NOT (user_b_id IS DISTINCT FROM auth.uid())

  When user_b_id IS NULL (solo couple, no partner yet), this evaluates as:
    NULL IS DISTINCT FROM <uuid> = TRUE
    NOT TRUE = FALSE

  A WITH CHECK that returns FALSE blocks the update. This means solo couple owners
  (e.g. Josh, who hasn't paired yet) cannot update their own couple row at all —
  refreshing the invite code fails every time with an RLS error.

  ## Fix
  Replace the guard with IS NOT DISTINCT FROM, which always returns TRUE or FALSE:

    NOT (auth.uid() = user_a_id AND user_b_id IS NOT DISTINCT FROM auth.uid())

  When user_b_id IS NULL:
    user_b_id IS NOT DISTINCT FROM auth.uid() = FALSE  (NULL is distinct from a uuid)
    auth.uid() = user_a_id AND FALSE = FALSE
    NOT FALSE = TRUE  ← update allowed ✓

  The self-pairing guard is preserved: if user_b_id = auth.uid() = user_a_id,
    user_b_id IS NOT DISTINCT FROM auth.uid() = TRUE
    auth.uid() = user_a_id AND TRUE = TRUE
    NOT TRUE = FALSE  ← self-pairing still blocked ✓
*/

DROP POLICY IF EXISTS "Couple members can update their couple" ON public.couples;

CREATE POLICY "Couple members can update their couple"
  ON public.couples FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_a_id OR auth.uid() = user_b_id)
  WITH CHECK (
    (auth.uid() = user_a_id OR auth.uid() = user_b_id)
    AND NOT (auth.uid() = user_a_id AND user_b_id IS NOT DISTINCT FROM auth.uid())
  );
