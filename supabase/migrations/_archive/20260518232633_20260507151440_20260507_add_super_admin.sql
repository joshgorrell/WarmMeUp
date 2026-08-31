
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_super_admin boolean NOT NULL DEFAULT false;

UPDATE profiles
  SET is_super_admin = true
  WHERE is_admin = true;

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

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Super-admins can grant or revoke admin privileges' AND tablename = 'profiles') THEN
    CREATE POLICY "Super-admins can grant or revoke admin privileges"
      ON profiles FOR UPDATE
      TO authenticated
      USING (is_super_admin())
      WITH CHECK (is_super_admin());
  END IF;
END $$;
