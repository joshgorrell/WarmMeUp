/*
# Revoke admin grant and debug-access function execution, prevent new admin_grants

## Purpose
Removes the ability for any client (anon, authenticated, or public) to:
1. Call `grant_entitlement` RPC — no new manual entitlement grants can be created.
2. Call debug-access functions (`validate_debug_support_code`, `get_global_debug_status`, `admin_set_global_debug_access`).
3. Insert new rows into `admin_grants` table (historical records preserved).

## Changes
1. Revoke EXECUTE on `grant_entitlement` from PUBLIC, anon, and authenticated.
2. Revoke EXECUTE on `validate_debug_support_code` from PUBLIC, anon, and authenticated.
3. Revoke EXECUTE on `get_global_debug_status` from PUBLIC, anon, and authenticated.
4. Revoke EXECUTE on `admin_set_global_debug_access` from PUBLIC, anon, and authenticated.
5. Add a trigger `prevent_new_admin_grants` that blocks any INSERT on `admin_grants`.
   Existing rows are preserved — only new inserts are blocked.

## Security
- The `admin_grants` table and all historical data remain untouched.
- Functions are not dropped — only execution privileges are revoked.
- The trigger prevents new grants from being created even by service-role clients
  that might bypass RLS, providing defense-in-depth.

## Important Notes
1. This is a one-way operation — re-granting these privileges would require a
   future migration. This is intentional for App Store compliance.
2. The `admin_grants` table is NOT dropped, renamed, or altered. Only inserts are blocked.
3. Existing active grants in the table remain but the edge function no longer checks them,
   so they have no effect on customer access.
*/

-- 1. Revoke grant_entitlement from all client roles
REVOKE EXECUTE ON FUNCTION public.grant_entitlement FROM PUBLIC, anon, authenticated;

-- 2. Revoke debug-access functions from all client roles
REVOKE EXECUTE ON FUNCTION public.validate_debug_support_code FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_global_debug_status FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_set_global_debug_access FROM PUBLIC, anon, authenticated;

-- 3. Prevent any new admin_grants rows from being inserted
-- The trigger fires BEFORE INSERT and raises an exception, blocking the insert.
-- Existing rows are untouched — only new inserts are blocked.

-- Drop the trigger if it already exists (idempotent)
DROP TRIGGER IF EXISTS prevent_new_admin_grants ON public.admin_grants;

-- Drop the trigger function if it already exists (idempotent)
DROP FUNCTION IF EXISTS public.block_admin_grant_insert();

-- Create the trigger function
CREATE OR REPLACE FUNCTION public.block_admin_grant_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'New admin_grants inserts are disabled. Manual entitlement grants are no longer supported.';
  RETURN NULL;
END;
$$;

-- Create the trigger
CREATE TRIGGER prevent_new_admin_grants
  BEFORE INSERT ON public.admin_grants
  FOR EACH ROW
  EXECUTE FUNCTION public.block_admin_grant_insert();

-- Revoke EXECUTE on the trigger function from client roles too
REVOKE EXECUTE ON FUNCTION public.block_admin_grant_insert FROM PUBLIC, anon, authenticated;
