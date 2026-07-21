/*
  # Fix RLS helper functions and admin policies

  ## Problem
  1. `is_current_user_admin()` only checks `is_admin`, not `is_super_admin`.
     Super admins cannot pass RLS checks on couples, profiles, subscriptions, etc.
  2. `interactions` admin SELECT policy checks `is_admin = true` inline without
     using the helper function, so super admins cannot read all interactions.
  3. `admin_grants` INSERT policy has no auth check — any authenticated user can
     insert grants.

  ## Changes
  1. Replace `is_current_user_admin()` body to return true when either
     `is_admin = true` OR `is_super_admin = true`.
  2. Drop and recreate the `interactions` "Admins can read all interactions" policy
     to use `is_current_user_admin()` (which now covers super admins).
  3. Drop and recreate the `admin_grants` INSERT policy to require admin or super admin.
*/

-- 1. Fix is_current_user_admin() to include super admins
CREATE OR REPLACE FUNCTION public.is_current_user_admin()
  RETURNS boolean
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
SELECT COALESCE(
  (SELECT (is_admin = true OR is_super_admin = true)
   FROM public.profiles
   WHERE id = auth.uid()),
  false
);
$$;

-- 2. Fix interactions admin read policy to use the updated helper
DROP POLICY IF EXISTS "Admins can read all interactions" ON public.interactions;
CREATE POLICY "Admins can read all interactions"
  ON public.interactions
  FOR SELECT
  TO authenticated
  USING (is_current_user_admin());

-- 3. Fix admin_grants INSERT policy to require admin privilege
DROP POLICY IF EXISTS "Admins can insert admin grants" ON public.admin_grants;
CREATE POLICY "Admins can insert admin grants"
  ON public.admin_grants
  FOR INSERT
  TO authenticated
  WITH CHECK (is_current_user_admin());
