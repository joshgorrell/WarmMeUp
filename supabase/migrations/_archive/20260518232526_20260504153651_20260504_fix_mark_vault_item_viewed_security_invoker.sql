
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

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Partner can mark vault item as viewed' AND tablename = 'vault_items') THEN
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
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.mark_vault_item_viewed(uuid) FROM public;
REVOKE EXECUTE ON FUNCTION public.mark_vault_item_viewed(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.mark_vault_item_viewed(uuid) TO authenticated;
