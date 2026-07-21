/*
  # Fix is_super_admin function security

  1. Sets a fixed search_path on the function to prevent search path mutable attacks
  2. Revokes EXECUTE from PUBLIC (covers both anon and authenticated roles)
  3. Grants EXECUTE back only to authenticated — the function is only needed
     for RLS policy evaluation on behalf of logged-in users
*/

CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_super_admin FROM profiles WHERE id = auth.uid()),
    false
  );
$$;

-- Revoke from everyone first, then grant only to authenticated
REVOKE EXECUTE ON FUNCTION is_super_admin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION is_super_admin() FROM anon;
GRANT EXECUTE ON FUNCTION is_super_admin() TO authenticated;
