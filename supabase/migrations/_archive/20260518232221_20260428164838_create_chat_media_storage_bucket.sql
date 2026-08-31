
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chat_media',
  'chat_media',
  false,
  52428800,
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'video/mp4',
    'video/quicktime'
  ]
)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Couple members can upload chat media' AND tablename = 'objects') THEN
    EXECUTE $policy$
      CREATE POLICY "Couple members can upload chat media"
        ON storage.objects FOR INSERT
        TO authenticated
        WITH CHECK (
          bucket_id = 'chat_media'
          AND EXISTS (
            SELECT 1 FROM couples
            WHERE id::text = (storage.foldername(name))[1]
            AND (user_a_id = auth.uid() OR user_b_id = auth.uid())
            AND active = true
          )
        )
    $policy$;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Couple members can read chat media' AND tablename = 'objects') THEN
    EXECUTE $policy$
      CREATE POLICY "Couple members can read chat media"
        ON storage.objects FOR SELECT
        TO authenticated
        USING (
          bucket_id = 'chat_media'
          AND EXISTS (
            SELECT 1 FROM couples
            WHERE id::text = (storage.foldername(name))[1]
            AND (user_a_id = auth.uid() OR user_b_id = auth.uid())
            AND active = true
          )
        )
    $policy$;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can delete their own chat media' AND tablename = 'objects') THEN
    EXECUTE $policy$
      CREATE POLICY "Users can delete their own chat media"
        ON storage.objects FOR DELETE
        TO authenticated
        USING (
          bucket_id = 'chat_media'
          AND (storage.foldername(name))[2] = auth.uid()::text
        )
    $policy$;
  END IF;
END $$;
