/*
  # Create chat_media storage bucket

  ## New Bucket
  - `chat_media` — private bucket for photos/videos attached to notes
    - Not public (access via signed URLs or RLS policies)
    - Max file size: 50 MB
    - Allowed MIME types: image/jpeg, image/png, image/webp, image/gif, video/mp4, video/quicktime

  ## Security
  - Only authenticated couple members can upload to their couple's folder
  - Path structure: {couple_id}/{user_id}/{filename}
  - Couple members can read all media in their couple's folder
  - Uploader can delete their own files
*/

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
  );

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
  );

CREATE POLICY "Users can delete their own chat media"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'chat_media'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );
