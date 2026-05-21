/*
  # Add UPDATE policy for vault and chat_media storage objects

  ## Summary
  The native iOS upload function sends PUT requests which Supabase Storage may
  internally interpret as upsert operations. When an upsert triggers an UPDATE
  on storage.objects, there must be a matching UPDATE RLS policy — without one,
  the upload fails with a 403 even though the INSERT policy would pass.

  ## Changes
  - vault bucket: adds UPDATE policy so uploaders can overwrite their own files
  - chat_media bucket: adds UPDATE policy so uploaders can overwrite their own files

  ## Security
  - Both policies restrict to the file owner (segment[2] = auth.uid()) within
    their own couple (segment[1] matches couples table membership), identical
    logic to the existing INSERT and DELETE policies.
  - No cross-user or cross-couple access is possible.

  ## Notes
  - The app generates unique timestamp filenames so overwrites never occur in
    practice; this policy is purely a safety net for Storage's internal upsert
    implementation.
*/

-- Vault: allow uploaders to update (overwrite) their own files
DROP POLICY IF EXISTS "Vault: uploaders can update own media" ON storage.objects;
CREATE POLICY "Vault: uploaders can update own media"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'vault'
    AND EXISTS (
      SELECT 1 FROM couples
      WHERE (couples.id)::text = (storage.foldername(objects.name))[1]
        AND (couples.user_a_id = auth.uid() OR couples.user_b_id = auth.uid())
    )
    AND (storage.foldername(objects.name))[2] = (auth.uid())::text
  )
  WITH CHECK (
    bucket_id = 'vault'
    AND EXISTS (
      SELECT 1 FROM couples
      WHERE (couples.id)::text = (storage.foldername(objects.name))[1]
        AND (couples.user_a_id = auth.uid() OR couples.user_b_id = auth.uid())
    )
    AND (storage.foldername(objects.name))[2] = (auth.uid())::text
  );

-- Chat media: allow uploaders to update (overwrite) their own files
DROP POLICY IF EXISTS "Chat media: uploaders can update own media" ON storage.objects;
CREATE POLICY "Chat media: uploaders can update own media"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'chat_media'
    AND EXISTS (
      SELECT 1 FROM couples
      WHERE (couples.id)::text = (storage.foldername(objects.name))[1]
        AND (couples.user_a_id = auth.uid() OR couples.user_b_id = auth.uid())
    )
    AND (storage.foldername(objects.name))[2] = (auth.uid())::text
  )
  WITH CHECK (
    bucket_id = 'chat_media'
    AND EXISTS (
      SELECT 1 FROM couples
      WHERE (couples.id)::text = (storage.foldername(objects.name))[1]
        AND (couples.user_a_id = auth.uid() OR couples.user_b_id = auth.uid())
    )
    AND (storage.foldername(objects.name))[2] = (auth.uid())::text
  );
