
DROP POLICY IF EXISTS "Vault upload matches couple and user path segments" ON storage.objects;

CREATE POLICY "Vault upload matches couple and user path segments"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'vault'
    AND EXISTS (
      SELECT 1 FROM couples
      WHERE (couples.id)::text = (storage.foldername(objects.name))[1]
        AND (couples.user_a_id = auth.uid() OR couples.user_b_id = auth.uid())
    )
    AND (storage.foldername(name))[2] = (auth.uid())::text
  );
