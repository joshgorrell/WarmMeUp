/*
  # Add debug_database_identity RPC

  ## Purpose
  Diagnostic function to confirm which Supabase project the running app is
  actually connected to. Callable from the in-app debug screen by both
  anon and authenticated roles so it works before and after login.

  ## New Functions
  - `public.debug_database_identity()` — returns a jsonb object with:
    - `database`: current_database()
    - `schema`: current_schema()
    - `db_user`: current_user
    - `server_time`: now()
    - `project_ref_hint`: true if app.settings.jwt_secret is set (confirms this is
       the intended Supabase project)

  ## Security
  - SECURITY DEFINER with `search_path = public`
  - Granted to both `anon` and `authenticated` roles

  ## Notes
  - `notify pgrst, 'reload schema'` is included to flush any stale PostgREST
    schema cache that could cause PGRST202 errors on recently-created functions
    like `generate_invite_code`.
*/

CREATE OR REPLACE FUNCTION public.debug_database_identity()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'database', current_database(),
    'schema', current_schema(),
    'db_user', current_user,
    'server_time', now(),
    'project_ref_hint', current_setting('app.settings.jwt_secret', true) IS NOT NULL
  );
$$;

GRANT EXECUTE ON FUNCTION public.debug_database_identity() TO anon;
GRANT EXECUTE ON FUNCTION public.debug_database_identity() TO authenticated;

NOTIFY pgrst, 'reload schema';
