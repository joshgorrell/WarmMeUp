/*
  # Fix vault storage upload RLS policy

  ## Problem
  The existing vault storage INSERT policies check for couple_id at the wrong path
  segment. The upload path used by the app is:
    {couple_id}/{user_id}/{timestamp}.ext

  - foldername(name)[1] = couple_id
  - foldername(name)[2] = user_id

  Both existing upload policies ("Couple members can upload vault files" and
  "Couple members can upload vault media") look for couple_id at segment [2],
  which is actually the user_id position. So every upload fails with an RLS error.

  ## Fix
  Add a new INSERT policy that correctly matches the actual path structure:
  - segment [1] must be a couple_id the authenticated user belongs to (active couple)
  - segment [2] must be the authenticated user's own id
*/

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
