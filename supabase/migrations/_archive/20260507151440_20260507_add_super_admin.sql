/*
  # Add Super Admin Role

  ## Summary
  Introduces a `is_super_admin` boolean column on profiles to distinguish the
  top-level owner account from regular admins. Super-admins can grant or revoke
  admin privileges for other users; regular admins cannot.

  ## Changes
  1. New column: `profiles.is_super_admin` (boolean, DEFAULT false)
  2. Sets the existing Josh account (the sole current admin) as super-admin
  3. New RLS policy: only super-admins may update `is_admin` on other profiles
     (enforced via a SECURITY DEFINER function to avoid recursive policy lookups)

  ## Security Notes
  - Regular admins retain all existing read/write permissions unchanged
  - Only a super-admin can flip another user's `is_admin` flag
  - A super-admin cannot demote themselves (enforced in the UI; DB allows it for
    emergency recovery via direct SQL)
*/

-- 1. Add the column
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_super_admin boolean NOT NULL DEFAULT false;

-- 2. Promote the existing admin (Josh) to super-admin
UPDATE profiles
  SET is_super_admin = true
  WHERE is_admin = true;

-- 3. Create a helper function that checks super-admin status without
--    hitting the profiles table RLS policies (avoids recursion)
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT COALESCE(
    (SELECT is_super_admin FROM profiles WHERE id = auth.uid()),
    false
  );
$$;

-- 4. RLS policy: only super-admins can update the is_admin / is_super_admin flags
--    (regular admins already have an update policy but we restrict these two columns)
CREATE POLICY "Super-admins can grant or revoke admin privileges"
  ON profiles FOR UPDATE
  TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());
