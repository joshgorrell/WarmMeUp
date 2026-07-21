/*
  # Fix vault storage upload policy — remove active = true requirement

  ## Problem
  The "Vault upload matches couple and user path segments" storage INSERT policy
  requires `couples.active = true`, but a user can be in a couple that is not yet
  active (partner not yet joined). This blocked vault uploads for solo / unpaired
  users, producing "new row violates row-level security policy" errors.

  ## Fix
  Replace the INSERT policy so it only checks that the user belongs to the couple
  referenced in the path, without requiring the couple to be active. This is
  consistent with the vault_items table INSERT policy which has no active check.

  The path format is: {couple_id}/{user_id}/{filename}
  storage.foldername(name) returns ['couple_id', 'user_id'] for that path.
*/

-- Drop the old over-restrictive INSERT policy
DROP POLICY IF EXISTS "Vault upload matches couple and user path segments" ON storage.objects;

-- Create the corrected policy (no active = true constraint)
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
