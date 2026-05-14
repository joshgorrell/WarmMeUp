/*
  # Remove recursive admin RLS policies from profiles

  The "Admins can read all profiles" and "Admins can update any profile" policies
  called is_admin() which queried profiles again, causing infinite recursion.

  Admins already:
  - Can read their own profile via "Users can read own profile" (auth.uid() = id)
  - Can read partner profiles via the partner policy
  - Admin panel queries use service role or direct admin operations

  Removing these broken policies. Admin-level profile reads in the admin panel
  should use the Supabase service role key via edge functions, not client RLS.
*/

DROP POLICY IF EXISTS "Admins can read all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can update any profile" ON profiles;
DROP FUNCTION IF EXISTS public.is_admin();
