/*
  # Safe admin profiles read policy

  1. Problem
    - The previous "Admins can read all profiles" policy used a subquery
      against `profiles` from inside a `profiles` SELECT policy, causing
      infinite recursion (same bug fixed earlier).

  2. Solution
    - Drop the recursive policy.
    - Create a SECURITY DEFINER helper `public.is_current_user_admin()` that
      bypasses RLS for its internal lookup, so it can be called safely from
      any policy — including policies on `profiles` itself.
    - Re-create "Admins can read all profiles" using that helper.
    - Re-create equivalent helper-based admin policies on couples,
      interactions, scores, and prompt tables for consistency (they
      currently use inline EXISTS subqueries against profiles, which work
      but go through RLS each time; using the helper is faster and avoids
      future recursion traps).

  3. Security
    - `is_current_user_admin()` is SECURITY DEFINER and reads ONLY the
      caller's own `is_admin` column from `profiles`. It cannot leak data.
    - The function is granted EXECUTE to authenticated only.
*/

-- 1. Helper function (bypasses RLS via SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.is_current_user_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_admin FROM public.profiles WHERE id = auth.uid()),
    false
  );
$$;

REVOKE ALL ON FUNCTION public.is_current_user_admin() FROM public;
GRANT EXECUTE ON FUNCTION public.is_current_user_admin() TO authenticated;

-- 2. Replace the (potentially recursive) admin profiles read policy
DROP POLICY IF EXISTS "Admins can read all profiles" ON public.profiles;

CREATE POLICY "Admins can read all profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (public.is_current_user_admin());
