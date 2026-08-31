/*
  # Switch mark_vault_item_viewed to SECURITY INVOKER

  ## Problem
  The function was created as SECURITY DEFINER to bypass RLS for the narrow
  "partner marks item as viewed" operation. However, the WHERE clause already
  enforces the correct ownership checks:
    - item must belong to a couple the caller is a member of
    - item must have been uploaded by someone other than the caller

  SECURITY DEFINER is therefore not needed — the caller's own RLS context plus
  the explicit WHERE conditions are sufficient to restrict access correctly.
  Switching to SECURITY INVOKER removes the privilege escalation surface.

  ## Changes
  - Recreate public.mark_vault_item_viewed(uuid) as SECURITY INVOKER
  - Add an UPDATE policy on vault_items so the invoker context can write viewed_by_partner
  - Retain EXECUTE grant for authenticated role
*/

-- Recreate the function as SECURITY INVOKER
CREATE OR REPLACE FUNCTION public.mark_vault_item_viewed(item_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
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

-- Partners need an UPDATE policy that allows setting viewed_by_partner on items they did not upload
CREATE POLICY "Partner can mark vault item as viewed"
  ON vault_items FOR UPDATE
  TO authenticated
  USING (
    uploaded_by_user_id != auth.uid()
    AND couple_id IN (
      SELECT id FROM couples
      WHERE (user_a_id = auth.uid() OR user_b_id = auth.uid())
      AND active = true
    )
  )
  WITH CHECK (
    uploaded_by_user_id != auth.uid()
    AND couple_id IN (
      SELECT id FROM couples
      WHERE (user_a_id = auth.uid() OR user_b_id = auth.uid())
      AND active = true
    )
  );

-- Retain execute permission
REVOKE ALL ON FUNCTION public.mark_vault_item_viewed(uuid) FROM public;
REVOKE EXECUTE ON FUNCTION public.mark_vault_item_viewed(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.mark_vault_item_viewed(uuid) TO authenticated;
