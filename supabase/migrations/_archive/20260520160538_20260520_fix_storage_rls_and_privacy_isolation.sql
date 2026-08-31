/*
  # Fix storage RLS policies for vault and chat_media buckets

  ## Summary
  This migration fixes two problems simultaneously:
  
  1. **Upload failures** — All existing INSERT and SELECT storage policies required
     `couples.active = true`, blocking uploads and signed URL generation for couples
     that haven't fully paired yet (active = false).
  
  2. **Privacy hardening** — DELETE policies only checked user_id in the path but not
     couple membership. Rebuilt to verify both segments for defense in depth.

  ## Changes

  ### Vault bucket (storage.objects)
  - DROP: "Couple members can upload vault media" (stale, active = true, never removed)
  - DROP: "Vault upload matches couple and user path segments" (partial fix, inconsistent foldername() call)
  - DROP: "Couple members can read vault media" (active = true blocks signed URL generation)
  - DROP: "Users can delete their own vault media" (missing couple membership check)
  - CREATE: Clean INSERT policy — couple membership on segment 1, user_id on segment 2
  - CREATE: Clean SELECT policy — couple membership on segment 1 (both partners can view)
  - CREATE: Clean DELETE policy — couple membership on segment 1 + user_id on segment 2

  ### chat_media bucket (storage.objects)
  - DROP: "Couple members can upload chat media" (active = true blocks all uploads)
  - DROP: "Couple members can read chat media" (active = true blocks signed URL generation)
  - DROP: "Users can delete their own chat media" (missing couple membership check)
  - CREATE: Clean INSERT policy — couple membership on segment 1, user_id on segment 2
  - CREATE: Clean SELECT policy — couple membership on segment 1 (both partners can view)
  - CREATE: Clean DELETE policy — couple membership on segment 1 + user_id on segment 2

  ### mark_vault_item_viewed() function
  - Removes the `active = true` check so partners can mark items viewed regardless of active state

  ## Privacy guarantee
  - Buckets remain private (public = false) — no anonymous access
  - All media access requires an authenticated signed URL
  - Signed URLs can only be generated if the SELECT policy passes (couple membership check)
  - Users can only upload into a path whose first segment is their own couple
  - Users can only upload into a path whose second segment is their own user_id
  - Users can only delete files from their own couple's path AND their own user folder
  - No cross-couple access is possible at any layer
*/

-- ============================================================
-- VAULT BUCKET: drop all existing policies
-- ============================================================
DROP POLICY IF EXISTS "Couple members can upload vault media" ON storage.objects;
DROP POLICY IF EXISTS "Vault upload matches couple and user path segments" ON storage.objects;
DROP POLICY IF EXISTS "Couple members can read vault media" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own vault media" ON storage.objects;

-- ============================================================
-- VAULT BUCKET: recreate clean policies
-- Path structure: {couple_id}/{user_id}/{filename}
-- ============================================================

-- INSERT: uploader must belong to the couple in segment[1] and their uid must be segment[2]
CREATE POLICY "Vault: couple members can upload to own path"
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
    AND (storage.foldername(objects.name))[2] = (auth.uid())::text
  );

-- SELECT: either partner in the couple can read (needed for signed URL generation)
CREATE POLICY "Vault: couple members can read media"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'vault'
    AND EXISTS (
      SELECT 1 FROM couples
      WHERE (couples.id)::text = (storage.foldername(objects.name))[1]
        AND (couples.user_a_id = auth.uid() OR couples.user_b_id = auth.uid())
    )
  );

-- DELETE: only the uploader (segment[2] = uid) within their own couple (segment[1])
CREATE POLICY "Vault: uploaders can delete own media"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'vault'
    AND EXISTS (
      SELECT 1 FROM couples
      WHERE (couples.id)::text = (storage.foldername(objects.name))[1]
        AND (couples.user_a_id = auth.uid() OR couples.user_b_id = auth.uid())
    )
    AND (storage.foldername(objects.name))[2] = (auth.uid())::text
  );

-- ============================================================
-- CHAT_MEDIA BUCKET: drop all existing policies
-- ============================================================
DROP POLICY IF EXISTS "Couple members can upload chat media" ON storage.objects;
DROP POLICY IF EXISTS "Couple members can read chat media" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own chat media" ON storage.objects;

-- ============================================================
-- CHAT_MEDIA BUCKET: recreate clean policies
-- Path structure: {couple_id}/{user_id}/{filename}
-- ============================================================

-- INSERT: uploader must belong to the couple in segment[1] and their uid must be segment[2]
CREATE POLICY "Chat media: couple members can upload to own path"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'chat_media'
    AND EXISTS (
      SELECT 1 FROM couples
      WHERE (couples.id)::text = (storage.foldername(objects.name))[1]
        AND (couples.user_a_id = auth.uid() OR couples.user_b_id = auth.uid())
    )
    AND (storage.foldername(objects.name))[2] = (auth.uid())::text
  );

-- SELECT: either partner in the couple can read (needed for signed URL generation)
CREATE POLICY "Chat media: couple members can read media"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'chat_media'
    AND EXISTS (
      SELECT 1 FROM couples
      WHERE (couples.id)::text = (storage.foldername(objects.name))[1]
        AND (couples.user_a_id = auth.uid() OR couples.user_b_id = auth.uid())
    )
  );

-- DELETE: only the uploader (segment[2] = uid) within their own couple (segment[1])
CREATE POLICY "Chat media: uploaders can delete own media"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'chat_media'
    AND EXISTS (
      SELECT 1 FROM couples
      WHERE (couples.id)::text = (storage.foldername(objects.name))[1]
        AND (couples.user_a_id = auth.uid() OR couples.user_b_id = auth.uid())
    )
    AND (storage.foldername(objects.name))[2] = (auth.uid())::text
  );

-- ============================================================
-- Fix mark_vault_item_viewed() — remove active = true check
-- ============================================================
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
    )
    AND uploaded_by_user_id != auth.uid();
END;
$$;

COMMENT ON FUNCTION public.mark_vault_item_viewed(uuid) IS
  'SECURITY DEFINER is intentional: this function updates vault_items.viewed_by_partner '
  'for the partner (non-uploader) of a couple, bypassing the uploader-only UPDATE RLS '
  'policy. The body is scoped to the caller''s couple and explicitly excludes rows '
  'uploaded by the caller, preventing any privilege escalation.';
