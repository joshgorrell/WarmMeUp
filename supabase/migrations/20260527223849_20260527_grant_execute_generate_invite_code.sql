/*
  # Grant EXECUTE on generate_invite_code to authenticated role

  ## Problem
  The generate_invite_code() RPC had no explicit EXECUTE grant for the
  authenticated role, causing the function call to be rejected by Postgres
  when invoked from the app via the Supabase client.

  ## Changes
  - Grant EXECUTE on public.generate_invite_code() to authenticated
  - Notify PostgREST to reload its schema cache so the grant takes effect
    without a full project restart
*/

GRANT EXECUTE ON FUNCTION public.generate_invite_code() TO authenticated;

NOTIFY pgrst, 'reload schema';
