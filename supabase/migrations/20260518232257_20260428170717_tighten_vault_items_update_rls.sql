
DROP POLICY IF EXISTS "Couple members can update vault items" ON vault_items;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Uploader can update own vault items' AND tablename = 'vault_items') THEN
    CREATE POLICY "Uploader can update own vault items"
      ON vault_items FOR UPDATE
      TO authenticated
      USING (auth.uid() = uploaded_by_user_id)
      WITH CHECK (auth.uid() = uploaded_by_user_id);
  END IF;
END $$;

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
