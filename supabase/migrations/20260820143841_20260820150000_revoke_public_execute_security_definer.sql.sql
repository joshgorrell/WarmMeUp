/*
# Revoke PUBLIC EXECUTE on SECURITY DEFINER functions

1. Security Changes
- `REVOKE EXECUTE ON FUNCTION public.check_email_collision(text, uuid) FROM PUBLIC;`
  This SECURITY DEFINER function queries auth.users by email. Although the
  edge function validates the caller's JWT, the function itself was callable
  by the PUBLIC role (which includes anon) via PostgREST, allowing unauthenticated
  email enumeration. Now only the service role (used by the edge function) can call it.
- `REVOKE EXECUTE ON FUNCTION public.set_vault_video_thumbnail_path() FROM PUBLIC;`
  Same risk — a SECURITY DEFINER function that modifies data should not be
  callable by unauthenticated users.

2. Important Notes
- These functions are called exclusively from edge functions using the service
  role key, which bypasses the EXECUTE privilege check. Revoking from PUBLIC
  does not affect the edge function code path.
- The existing REVOKE from anon and authenticated (already in the migration
  that created check_email_collision) did not cover the implicit PUBLIC grant
  that PostgreSQL applies to all functions by default.
*/

REVOKE EXECUTE ON FUNCTION public.check_email_collision(text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_vault_video_thumbnail_path() FROM PUBLIC;
