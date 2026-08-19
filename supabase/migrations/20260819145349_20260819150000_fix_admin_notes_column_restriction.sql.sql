/*
# Fix admin_notes column restriction on couples

## Problem
The previous migration re-granted table-level SELECT on couples to authenticated
and anon, then tried to REVOKE column-level SELECT on admin_notes. But in
Postgres, a table-level GRANT overrides column-level REVOKE — if you have
table-level SELECT, you can read all columns regardless of column-level
revocations. So admin_notes was still readable.

## Fix
1. Revoke table-level SELECT from authenticated and anon.
2. Grant column-level SELECT on all columns EXCEPT admin_notes to authenticated
   and anon. This is the correct way to restrict a single column while allowing
   all others.
3. Keep all existing RLS policies unchanged.
4. Reload PostgREST schema cache.

## Security
- admin_notes is now truly restricted: no table-level SELECT exists, and the
  column is excluded from the column-level grant.
- Admins can still read admin_notes via the service_role / postgres superuser
  bypass, or via the "Admins can read all couples" RLS policy when querying
  through an edge function with the service role key.
- All other columns remain accessible to authenticated and anon as before.
- Idempotent: safe to re-run.

## Important Notes
1. PostgREST works with column-level grants as long as the requesting role has
   SELECT on all columns referenced in the query. The app queries couples with
   select('*'), which expands to all columns the role has SELECT on — so it will
   get all columns except admin_notes. This is the correct behavior.
2. The admin frontend uses the service role key (via edge functions), not the
   anon/authenticated client, for admin_notes access.
*/

-- ─── 1. Revoke table-level SELECT ─────────────────────────────────────
REVOKE SELECT ON public.couples FROM authenticated;
REVOKE SELECT ON public.couples FROM anon;

-- ─── 2. Grant column-level SELECT on all columns except admin_notes ───
-- List all columns explicitly to ensure completeness.
GRANT SELECT (
  id, user_a_id, user_b_id, invite_code, active, created_at,
  points_enabled, streaks_enabled, subscription_owner_id,
  disconnected_at, invite_code_expires_at, invite_code_used_at,
  updated_at, anniversary_date, pending_partner_id, pending_partner_status,
  pending_requested_at, trial_expired_notified_at, trial_expired_reminder_sent
) ON public.couples TO authenticated;

GRANT SELECT (
  id, user_a_id, user_b_id, invite_code, active, created_at,
  points_enabled, streaks_enabled, subscription_owner_id,
  disconnected_at, invite_code_expires_at, invite_code_used_at,
  updated_at, anniversary_date, pending_partner_id, pending_partner_status,
  pending_requested_at, trial_expired_notified_at, trial_expired_reminder_sent
) ON public.couples TO anon;

-- ─── 3. Reload PostgREST schema cache ─────────────────────────────────
NOTIFY pgrst, 'reload schema';
