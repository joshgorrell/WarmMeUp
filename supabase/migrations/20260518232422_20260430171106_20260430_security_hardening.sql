
DROP POLICY IF EXISTS "Avatar images are publicly readable" ON storage.objects;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated users can read avatars' AND tablename = 'objects') THEN
    CREATE POLICY "Authenticated users can read avatars"
      ON storage.objects FOR SELECT
      TO authenticated
      USING (bucket_id = 'avatars');
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.handle_new_user_settings() FROM public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_settings() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_settings() FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.is_current_user_admin() FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_current_user_admin() FROM public;
GRANT EXECUTE ON FUNCTION public.is_current_user_admin() TO authenticated;

REVOKE ALL ON FUNCTION public.mark_vault_item_viewed(uuid) FROM public;
REVOKE EXECUTE ON FUNCTION public.mark_vault_item_viewed(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.mark_vault_item_viewed(uuid) TO authenticated;
