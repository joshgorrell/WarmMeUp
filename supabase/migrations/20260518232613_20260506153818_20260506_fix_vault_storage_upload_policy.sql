
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Vault upload matches couple and user path segments' AND tablename = 'objects') THEN
    CREATE POLICY "Vault upload matches couple and user path segments"
      ON storage.objects
      FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id = 'vault'
        AND EXISTS (
          SELECT 1 FROM couples
          WHERE couples.id::text = (storage.foldername(objects.name))[1]
            AND (couples.user_a_id = auth.uid() OR couples.user_b_id = auth.uid())
            AND couples.active = true
        )
        AND (storage.foldername(objects.name))[2] = auth.uid()::text
      );
  END IF;
END $$;
