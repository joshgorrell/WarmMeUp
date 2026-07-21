/*
  # Admins can read all profiles

  1. Security
    - Adds a SELECT policy on `profiles` so users with `is_admin = true`
      can read every profile row.
    - Required by the admin Couples & Stats screens, which join couples to
      profiles by user id; without this policy non-self/non-partner names
      would resolve to "Unknown".

  2. Notes
    - Existing "Users can read own profile" and "Users can read their
      partner's profile" policies remain in place; this one ADDS coverage
      for admin users only.
    - Uses `auth.uid()` for the admin check, never `current_user`.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
      AND policyname = 'Admins can read all profiles'
  ) THEN
    CREATE POLICY "Admins can read all profiles"
      ON public.profiles
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid() AND p.is_admin = true
        )
      );
  END IF;
END $$;
