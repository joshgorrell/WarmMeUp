/*
  # Security Hardening

  ## Summary
  Addresses four categories of security findings:

  1. **Avatars bucket listing exposure**
     - The broad `TO public` SELECT policy on `storage.objects` for the `avatars` bucket
       allows anonymous clients to list all avatar files, not just fetch known URLs.
     - Fix: drop the public policy and replace it with one scoped to `authenticated` only.
       Public bucket URLs still work without a policy because the bucket itself is marked
       `public = true` (Supabase serves those over the CDN without RLS evaluation).
       However, to allow partners to view each other's avatars (a legitimate need), we
       keep a SELECT policy but restrict it to authenticated users only.

  2. **`handle_new_user_settings` SECURITY DEFINER — revoke anon + authenticated RPC access**
     - This function is a trigger handler. It must never be callable via `/rpc/`.
     - Fix: revoke EXECUTE from both `anon` and `authenticated` (and `public`).
       The trigger itself runs as the postgres superuser role and is unaffected.

  3. **`is_current_user_admin` SECURITY DEFINER — revoke anon RPC access**
     - A previous migration correctly revoked from `public` and granted only `authenticated`.
       However the `anon` role may have inherited access. Explicitly revoke from `anon`.

  4. **`mark_vault_item_viewed` SECURITY DEFINER — revoke anon RPC access**
     - The original migration granted EXECUTE only to `authenticated`, but `anon` still
       inherited from `public`. Explicitly revoke from `anon` and `public`.

  ## Security changes
  - `storage.objects` avatars SELECT: restricted from `public` to `authenticated`
  - `handle_new_user_settings`: EXECUTE revoked from public, anon, authenticated
  - `is_current_user_admin`: EXECUTE revoked from anon
  - `mark_vault_item_viewed`: EXECUTE revoked from public and anon
*/

-- ─── 1. Avatars bucket: restrict listing to authenticated users only ──────────
-- Public bucket CDN URLs work without this policy; the SELECT policy is only
-- needed for authenticated in-app access (e.g. viewing a partner's avatar).

DROP POLICY IF EXISTS "Avatar images are publicly readable" ON storage.objects;

CREATE POLICY "Authenticated users can read avatars"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'avatars');

-- ─── 2. handle_new_user_settings — not callable via RPC ──────────────────────
-- This is a trigger function only. Clients must never be able to call it directly.

REVOKE ALL ON FUNCTION public.handle_new_user_settings() FROM public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_settings() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_settings() FROM authenticated;

-- ─── 3. is_current_user_admin — already restricted but ensure anon is excluded ─

REVOKE EXECUTE ON FUNCTION public.is_current_user_admin() FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_current_user_admin() FROM public;

-- Re-confirm only authenticated can call it (idempotent)
GRANT EXECUTE ON FUNCTION public.is_current_user_admin() TO authenticated;

-- ─── 4. mark_vault_item_viewed — only authenticated partners should call this ──

REVOKE ALL ON FUNCTION public.mark_vault_item_viewed(uuid) FROM public;
REVOKE EXECUTE ON FUNCTION public.mark_vault_item_viewed(uuid) FROM anon;

-- Re-confirm only authenticated can call it (idempotent)
GRANT EXECUTE ON FUNCTION public.mark_vault_item_viewed(uuid) TO authenticated;
