/*
  # Force PostgREST schema cache hard reload

  ## Problem
  PGRST202 "Could not find function public.generate_invite_code without parameters
  in schema cache" persists despite the function existing with the correct zero-arg
  signature and all grants being correct:
    - authenticator: USAGE on public schema = true
    - authenticator: EXECUTE on generate_invite_code() = true
    - anon: EXECUTE = true
    - authenticated: EXECUTE = true
    - pronargs = 0, arg_list = ""

  PostgREST's LISTEN/NOTIFY mechanism drops notifications silently when its listener
  connection is not active at the exact moment NOTIFY fires. Previous migrations all
  used bare NOTIFY which may have been missed.

  ## Fix
  1. Re-grant all roles explicitly (idempotent safety)
  2. Use pg_notify() inside a DO block with pg_sleep to hold the connection open,
     giving PostgREST's listener time to process the notification
  3. Fire NOTIFY a second time after the sleep as a belt-and-suspenders measure

  ## No schema changes — grants and cache reload only
*/

-- Re-grant schema usage to all PostgREST roles (idempotent)
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- Re-grant execute explicitly on the zero-arg function
GRANT EXECUTE ON FUNCTION public.generate_invite_code() TO anon;
GRANT EXECUTE ON FUNCTION public.generate_invite_code() TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_invite_code() TO service_role;

-- Fire reload notification, sleep to keep the connection alive while PostgREST
-- processes it, then fire again to maximise the chance one lands
DO $$
BEGIN
  PERFORM pg_notify('pgrst', 'reload schema');
  PERFORM pg_sleep(1);
  PERFORM pg_notify('pgrst', 'reload schema');
END $$;
