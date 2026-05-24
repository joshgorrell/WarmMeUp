/*
  # Re-apply correct couples UPDATE RLS policy

  ## Problem
  The live "Couple members can update their couple" policy still contains the
  broken WITH CHECK expression from before the 20260524161313 migration:

    NOT (user_b_id IS DISTINCT FROM auth.uid())

  When user_b_id IS NULL (solo couple, no partner yet), this evaluates to:
    NULL IS DISTINCT FROM <uuid> = TRUE
    NOT TRUE = FALSE  → update blocked

  This silently prevents solo couple owners from refreshing their invite code.

  ## Fix
  Drop and recreate the policy using IS NOT DISTINCT FROM, which handles NULL
  correctly and always returns TRUE or FALSE (never NULL):

    NOT (auth.uid() = user_a_id AND user_b_id IS NOT DISTINCT FROM auth.uid())

  When user_b_id IS NULL:
    NULL IS NOT DISTINCT FROM auth.uid() = FALSE
    auth.uid() = user_a_id AND FALSE = FALSE
    NOT FALSE = TRUE  → update allowed ✓

  Self-pairing guard still holds: when user_b_id = auth.uid() = user_a_id:
    user_b_id IS NOT DISTINCT FROM auth.uid() = TRUE
    auth.uid() = user_a_id AND TRUE = TRUE
    NOT TRUE = FALSE  → blocked ✓
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
