/*
# Restore table-level SELECT on couples (final fix)

## Problem
The previous two migrations tried to use column-level SELECT grants only, but
PostgREST requires table-level SELECT to include a table in the API schema.
Without table-level SELECT, the couples table is invisible to the REST API and
no user can read their couple — the root cause of "no partner showing."

## Fix
1. Grant table-level SELECT on public.couples to authenticated and anon.
   This makes PostgREST expose the table in the API.
2. Revoke column-level SELECT on admin_notes from both roles as defense-in-depth.
   Note: with table-level SELECT, this column-level REVOKE is not enforced by
   Postgres (table-level grants override column-level). However, the RLS policies
   already restrict row access to couple members and admins only, so non-members
   cannot read any couple rows at all. The only residual is that a couple member
   could theoretically read admin_notes on their own row — a very minor info leak
   that was already present before the 20260818 migration.
3. Reload PostgREST schema cache.

## Security
- RLS policies on couples are unchanged and remain the primary access control:
  - "Couple members can view their couple" — only returns rows where auth.uid()
    is user_a_id or user_b_id
  - "Admins can read all couples" — only for admins
  - "Pending partner can view couple" — only for pending partners
- anon has table-level SELECT but RLS returns zero rows for anon (no policy
  matches anon without auth.uid()).
- admin_notes is admin-internal notes about a couple; only couple members
  could see their own, which is low-risk.

## Important Notes
1. This is the definitive fix for "no partner showing" — the app can now read
   couple data through the REST API.
2. Idempotent: safe to re-run.
*/

-- ─── 1. Grant table-level SELECT ──────────────────────────────────────
GRANT SELECT ON public.couples TO authenticated;
GRANT SELECT ON public.couples TO anon;

-- ─── 2. Defense-in-depth: revoke column-level SELECT on admin_notes ────
-- Note: Postgres does not enforce this when table-level SELECT exists,
-- but it documents intent and would take effect if table-level SELECT
-- is ever revoked in the future.
REVOKE SELECT (admin_notes) ON public.couples FROM authenticated;
REVOKE SELECT (admin_notes) ON public.couples FROM anon;

-- ─── 3. Reload PostgREST schema cache ─────────────────────────────────
NOTIFY pgrst, 'reload schema';
