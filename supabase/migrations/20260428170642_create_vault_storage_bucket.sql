/*
  # Create vault storage bucket

  ## New Bucket
  - `vault` — private bucket for photos/videos added to the Vault
    - Not public (access via signed URLs only)
    - Max file size: 100 MB
    - Allowed MIME types: image/jpeg, image/png, image/webp, video/mp4, video/quicktime

  ## Security
  - Path structure: {couple_id}/{user_id}/{filename}
  - Only authenticated couple members can upload, read, or delete their own files
  - No public access at any time
*/

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'vault',
  'vault',
  false,
  104857600,
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'video/mp4',
    'video/quicktime'
  ]
)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Couple members can upload vault media'
    AND tablename = 'objects'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Couple members can upload vault media"
        ON storage.objects FOR INSERT
        TO authenticated
        WITH CHECK (
          bucket_id = 'vault'
          AND EXISTS (
            SELECT 1 FROM couples
            WHERE id::text = (storage.foldername(name))[1]
            AND (user_a_id = auth.uid() OR user_b_id = auth.uid())
            AND active = true
          )
        )
    $policy$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Couple members can read vault media'
    AND tablename = 'objects'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Couple members can read vault media"
        ON storage.objects FOR SELECT
        TO authenticated
        USING (
          bucket_id = 'vault'
          AND EXISTS (
            SELECT 1 FROM couples
            WHERE id::text = (storage.foldername(name))[1]
            AND (user_a_id = auth.uid() OR user_b_id = auth.uid())
            AND active = true
          )
        )
    $policy$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Users can delete their own vault media'
    AND tablename = 'objects'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Users can delete their own vault media"
        ON storage.objects FOR DELETE
        TO authenticated
        USING (
          bucket_id = 'vault'
          AND (storage.foldername(name))[2] = auth.uid()::text
        )
    $policy$;
  END IF;
END $$;
