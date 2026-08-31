/*
  # Force PostgREST schema cache reload — V4

  PostgREST caches the database schema at startup. When a new function is
  added (generate_invite_code), PostgREST must be signalled to reload its
  cache before it can route calls to that function. Without this, any RPC
  call returns PGRST202 ("function not found in schema cache") even though
  the function exists in pg_proc.

  This migration sends the reload signal and also re-asserts the EXECUTE
  grant so the anon → authenticated role chain is clean.

  Changes:
  - NOTIFY pgrst, 'reload schema'  — signals PostgREST to reload immediately
  - Re-GRANT EXECUTE on generate_invite_code to authenticated (idempotent safety)
*/

-- Re-assert execute grant (idempotent)
GRANT EXECUTE ON FUNCTION public.generate_invite_code() TO authenticated;

-- Signal PostgREST to reload its schema cache
NOTIFY pgrst, 'reload schema';
