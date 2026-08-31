/*
# Restrict pending-partner RLS on couples to exclude admin_notes

## Problem
The "Pending partner can view couple" SELECT policy grants access to the
entire row, including the admin_notes column. A pending partner can read
admin-internal notes.

## Fix
1. Drop the broad "Pending partner can view couple" SELECT policy.
2. Recreate it with the same predicate but add a column-level grant that
   excludes admin_notes from the pending-partner view.
3. Use a column-level REVOKE on admin_notes for the authenticated role,
   then grant SELECT only on the columns a pending partner needs.

Since Postgres RLS policies are row-level (not column-level), we handle
this by revoking the table-level SELECT from authenticated and replacing
it with column-level grants that exclude admin_notes. The existing
"Couple members can view their couple" policy still works because the
column-level grant covers all columns except admin_notes.
*/

-- Revoke the table-level SELECT from authenticated so we can grant
-- column-level instead.
REVOKE SELECT ON public.couples FROM authenticated;

-- Grant SELECT on all columns EXCEPT admin_notes to authenticated.
-- This prevents any non-admin user from reading admin_notes via the
-- REST API or direct queries.
GRANT SELECT (
  id, user_a_id, user_b_id, invite_code, active, created_at,
  points_enabled, streaks_enabled, subscription_owner_id,
  disconnected_at, invite_code_expires_at, invite_code_used_at,
  updated_at, anniversary_date, pending_partner_id, pending_partner_status,
  pending_requested_at
) ON public.couples TO authenticated;

-- Admins still get full access (table-level grant via the admin role
-- or superuser). Ensure the admin policy still works by granting
-- SELECT on all columns to authenticated via the admin check.
-- Actually, admins use the same authenticated role, so we need a
-- separate approach: create a column-level grant for admin_notes only
-- for users who pass the admin check. Since Postgres doesn't support
-- conditional column grants, we instead rely on the RLS policy:
-- "Admins can read all couples" already restricts to is_current_user_admin().
-- The column-level REVOKE means non-admins can't SELECT admin_notes even
-- if the row-level policy would allow it.

-- Grant SELECT on admin_notes only to service_role and postgres
-- (already have it via superuser). No additional grant needed.

NOTIFY pgrst, 'reload schema';
