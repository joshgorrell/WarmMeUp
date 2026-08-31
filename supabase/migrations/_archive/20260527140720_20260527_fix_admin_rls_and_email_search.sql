/*
  # Fix Admin RLS Policies and Add Email Search RPC

  ## Summary
  Several gaps were preventing Josh (global admin) from seeing data in the admin dashboard:

  1. `is_current_user_admin()` was NOT SECURITY DEFINER — when evaluated inside
     a policy on `profiles`, it re-enters the same policy causing infinite recursion
     or a silent false return. Fixed by recreating it as SECURITY DEFINER.

  2. `admin_grants` had no admin-wide SELECT policy — only own-row reads.
     Admins could not load the full active grants list in the Entitlements screen.

  3. `subscriptions` had no admin-wide SELECT policy — only own-row reads.
     Admins could not see subscription state for other users in the Entitlements screen.

  4. `wishes` had no admin SELECT policy at all.

  5. New `admin_search_user_by_email` RPC allows admins to search `auth.users`
     by exact email and return the matching profile ID + display name. This is
     required because `profiles` does not store email.

  ## Changes

  ### Functions modified
  - `is_current_user_admin()` — recreated as SECURITY DEFINER

  ### New RLS policies
  - `admin_grants`: "Admins can read all admin grants"
  - `subscriptions`: "Admins can read all subscriptions"
  - `wishes`: "Admins can read all wishes"

  ### New RPC
  - `admin_search_user_by_email(p_email text)` — SECURITY DEFINER, admin-only
*/

-- ─── 1. Recreate is_current_user_admin as SECURITY DEFINER ────────────────────
-- Without SECURITY DEFINER this function runs as the calling user and can
-- trigger infinite recursion when evaluated inside a profiles SELECT policy.
CREATE OR REPLACE FUNCTION public.is_current_user_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_admin FROM public.profiles WHERE id = auth.uid()),
    false
  );
$$;

-- ─── 2. Admin-wide SELECT on admin_grants ─────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'admin_grants'
      AND policyname = 'Admins can read all admin grants'
  ) THEN
    CREATE POLICY "Admins can read all admin grants"
      ON public.admin_grants
      FOR SELECT
      TO authenticated
      USING (is_current_user_admin() OR is_super_admin());
  END IF;
END $$;

-- ─── 3. Admin-wide SELECT on subscriptions ────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'subscriptions'
      AND policyname = 'Admins can read all subscriptions'
  ) THEN
    CREATE POLICY "Admins can read all subscriptions"
      ON public.subscriptions
      FOR SELECT
      TO authenticated
      USING (is_current_user_admin() OR is_super_admin());
  END IF;
END $$;

-- ─── 4. Admin-wide SELECT on wishes ───────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'wishes'
      AND policyname = 'Admins can read all wishes'
  ) THEN
    CREATE POLICY "Admins can read all wishes"
      ON public.wishes
      FOR SELECT
      TO authenticated
      USING (is_current_user_admin() OR is_super_admin());
  END IF;
END $$;

-- ─── 5. admin_search_user_by_email RPC ────────────────────────────────────────
-- Allows admins to resolve an email address to a profile ID + display name.
-- Uses SECURITY DEFINER to access auth.users which is not accessible via RLS.
-- The caller must be an admin (is_admin = true) or super-admin.
CREATE OR REPLACE FUNCTION public.admin_search_user_by_email(p_email text)
RETURNS TABLE (
  user_id   uuid,
  display_name text,
  email     text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  -- Enforce admin-only access at the function level
  IF NOT (is_current_user_admin() OR is_super_admin()) THEN
    RAISE EXCEPTION 'Access denied: admin only';
  END IF;

  RETURN QUERY
  SELECT
    u.id          AS user_id,
    COALESCE(p.display_name, split_part(u.email, '@', 1)) AS display_name,
    u.email       AS email
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  WHERE lower(u.email) = lower(p_email)
  LIMIT 1;
END;
$$;

-- Grant execute to authenticated users (the function enforces admin check internally)
GRANT EXECUTE ON FUNCTION public.admin_search_user_by_email(text) TO authenticated;
