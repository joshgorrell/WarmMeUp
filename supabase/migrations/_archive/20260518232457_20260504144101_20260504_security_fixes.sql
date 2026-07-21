
DROP POLICY IF EXISTS "Authenticated users can read avatars" ON storage.objects;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can read their own avatars' AND tablename = 'objects') THEN
    CREATE POLICY "Users can read their own avatars"
      ON storage.objects
      FOR SELECT
      TO authenticated
      USING (
        bucket_id = 'avatars'
        AND (storage.foldername(name))[1] = (auth.uid())::text
      );
  END IF;
END $$;

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

REVOKE EXECUTE ON FUNCTION public.is_current_user_admin() FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.is_current_user_admin() TO authenticated;

COMMENT ON FUNCTION public.mark_vault_item_viewed(uuid) IS
  'SECURITY DEFINER is intentional: this function updates vault_items.viewed_by_partner '
  'for the partner (non-uploader) of a couple, bypassing the uploader-only UPDATE RLS '
  'policy. The body is scoped to the caller''s active couple and explicitly excludes rows '
  'uploaded by the caller, preventing any privilege escalation.';
