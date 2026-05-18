
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

REVOKE EXECUTE ON FUNCTION is_super_admin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION is_super_admin() FROM anon;
GRANT EXECUTE ON FUNCTION is_super_admin() TO authenticated;
