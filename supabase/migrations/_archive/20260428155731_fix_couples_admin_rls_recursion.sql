/*
  # Fix couples admin RLS policies to avoid infinite recursion

  The existing "Admins can read all couples" and "Admins can update any couple" policies
  use a subquery against profiles inside a SELECT on couples. When a profiles SELECT policy
  also queries profiles (via is_admin check), this creates infinite recursion.

  Fix: replace the inline subquery with the existing SECURITY DEFINER helper
  public.is_current_user_admin() which bypasses RLS for its inner lookup.
*/

DROP POLICY IF EXISTS "Admins can read all couples" ON couples;
DROP POLICY IF EXISTS "Admins can update any couple" ON couples;

CREATE POLICY "Admins can read all couples"
  ON couples FOR SELECT
  TO authenticated
  USING (public.is_current_user_admin());

CREATE POLICY "Admins can update any couple"
  ON couples FOR UPDATE
  TO authenticated
  USING (public.is_current_user_admin())
  WITH CHECK (public.is_current_user_admin());
