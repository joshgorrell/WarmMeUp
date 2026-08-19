/*
  # Add check_email_collision RPC

  ## Purpose
  Returns any auth.users rows that share the given email but have a different ID.
  Used by the check-email-collision edge function to detect when an OAuth sign-in
  (Apple/Google) would create a duplicate account for a user who already has an
  email/password account with the same address.

  ## Security
  - SECURITY DEFINER — runs as the postgres superuser so it can read auth.users
  - Only callable via the service role key (edge function), not by anon/authenticated
  - Does NOT expose which provider the existing account uses — only that a collision exists
  - search_path pinned to 'pg_catalog' to prevent search_path injection

  ## Notes
  - Returns a set of UUIDs (the existing user IDs that match the email)
  - Empty result = no collision, safe to proceed
  - Non-empty result = collision detected, caller should sign out and show error
*/

CREATE OR REPLACE FUNCTION public.check_email_collision(p_email text, p_user_id uuid)
RETURNS TABLE (existing_user_id uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO pg_catalog
AS $function$
  SELECT id::uuid AS existing_user_id
  FROM auth.users
  WHERE email = p_email
    AND id <> p_user_id;
$function$;

-- Revoke execute from anon and authenticated — only service role should call this
REVOKE EXECUTE ON FUNCTION public.check_email_collision(text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.check_email_collision(text, uuid) FROM authenticated;
