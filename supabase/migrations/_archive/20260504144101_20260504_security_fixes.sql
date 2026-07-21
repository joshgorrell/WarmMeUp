/*
  # Security hardening

  1. Avatars storage
     - Drop the broad "Authenticated users can read avatars" SELECT policy that
       allows any signed-in user to list all files in the bucket.
     - Replace with a scoped policy: users can only read files inside their own
       folder (first path segment = their uid).

  2. is_current_user_admin()
     - Switch from SECURITY DEFINER to SECURITY INVOKER.
     - The function only reads `profiles` for the calling user's uid, which is
       already accessible via the existing RLS SELECT policy on profiles.
       SECURITY DEFINER is unnecessary and widens the attack surface.

  3. mark_vault_item_viewed(uuid)
     - This function intentionally runs as SECURITY DEFINER so it can UPDATE
       vault_items on behalf of the caller while bypassing the strict UPDATE RLS
       policy (which only allows the uploader to update their own rows).
     - The body is tightly scoped: it only updates rows where the caller is a
       member of the couple AND is NOT the uploader, so privilege escalation is
       not possible.
     - No change needed; a comment is added to the function to document the
       intentional design.
*/

-- 1. Fix avatars SELECT policy
DROP POLICY IF EXISTS "Authenticated users can read avatars" ON storage.objects;

CREATE POLICY "Users can read their own avatars"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );

-- 2. Rebuild is_current_user_admin as SECURITY INVOKER
CREATE OR REPLACE FUNCTION public.is_current_user_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_admin FROM public.profiles WHERE id = auth.uid()),
    false
  );
$$;

-- Remove the explicit authenticated execute grant since SECURITY INVOKER
-- means the function runs with the caller's own privileges (no escalation).
REVOKE EXECUTE ON FUNCTION public.is_current_user_admin() FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.is_current_user_admin() TO authenticated;

-- 3. Document mark_vault_item_viewed intentional SECURITY DEFINER
COMMENT ON FUNCTION public.mark_vault_item_viewed(uuid) IS
  'SECURITY DEFINER is intentional: this function updates vault_items.viewed_by_partner '
  'for the partner (non-uploader) of a couple, bypassing the uploader-only UPDATE RLS '
  'policy. The body is scoped to the caller''s active couple and explicitly excludes rows '
  'uploaded by the caller, preventing any privilege escalation.';
