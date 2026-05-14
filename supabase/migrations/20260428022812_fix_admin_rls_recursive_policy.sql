/*
  # Fix recursive RLS on profiles table

  The "Admins can read all profiles" and "Admins can update any profile" policies
  used a sub-select back into the profiles table to check is_admin, causing infinite
  recursion whenever any user tried to read their own profile.

  Fix: replace the recursive sub-select with a security-definer function that reads
  is_admin directly bypassing RLS, then use that in the policies.
*/

-- Helper function that checks is_admin without triggering RLS
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_admin FROM profiles WHERE id = auth.uid()),
    false
  );
$$;

-- Drop the broken recursive policies
DROP POLICY IF EXISTS "Admins can read all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can update any profile" ON profiles;

-- Recreate with non-recursive function
CREATE POLICY "Admins can read all profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "Admins can update any profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
