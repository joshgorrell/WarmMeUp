/*
  # Revoke excess EXECUTE grants on SECURITY DEFINER functions

  ## Summary
  Strips the `anon` role from functions that should never be callable by
  unauthenticated users, and strips both `anon` and `authenticated` from
  internal trigger functions that must never be invoked via the REST API.

  ## Changes

  ### Trigger functions (no role should call these via RPC)
  - `public.clear_invite_code_on_join()` — revoke anon + authenticated
  - `public.handle_new_profile_subscription()` — revoke anon + authenticated
  - `public.handle_new_user()` — revoke anon + authenticated

  ### Admin-only callable function
  - `public.admin_search_user_by_email(text)` — revoke anon + authenticated
    (function already enforces admin check internally, but no non-admin should
     be able to reach it at all)

  ### App-callable functions — revoke anon only, keep authenticated
  - `public.generate_invite_code()` — authenticated callers need this (pair flow)
  - `public.get_couple_by_invite_code(text)` — authenticated callers need this

  ### Already correct (no anon, authenticated kept)
  - `public.is_current_user_admin()` — used in RLS policies
  - `public.is_super_admin()` — used in RLS policies
  - `public.mark_vault_item_viewed(uuid)` — app calls directly

  ## Security Notes
  - Trigger functions are invoked by the Postgres trigger mechanism, not by
    role grants. Revoking EXECUTE does not break the triggers.
  - `admin_search_user_by_email` still guards itself internally, but removing
    the grant prevents PostgREST from advertising or routing to it for
    non-admin roles.
*/

-- Trigger functions: strip both anon and authenticated
REVOKE EXECUTE ON FUNCTION public.clear_invite_code_on_join() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_profile_subscription() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;

-- Admin-only function: strip both anon and authenticated (admins use service_role or direct DB access)
REVOKE EXECUTE ON FUNCTION public.admin_search_user_by_email(p_email text) FROM anon, authenticated;

-- App-callable functions: strip anon only, keep authenticated
REVOKE EXECUTE ON FUNCTION public.generate_invite_code() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_couple_by_invite_code(code text) FROM anon;

-- Reload PostgREST schema cache so revoked routes are removed immediately
NOTIFY pgrst, 'reload schema';
