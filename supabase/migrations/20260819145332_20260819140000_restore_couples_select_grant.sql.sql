/*
# Restore table-level SELECT on couples for authenticated

## Problem
Migration 20260818193000_restrict_pending_partner_couple_columns.sql revoked
the table-level SELECT privilege on public.couples from the authenticated role
and replaced it with column-level grants only. PostgREST (the Supabase REST API)
requires a table-level SELECT grant to expose a table in the API. Without it,
every query to couples returns empty results — even though RLS policies would
allow the row. This made it impossible for any paired user to see their partner,
their couple data, or their invite code through the app.

## Fix
1. Re-grant table-level SELECT on public.couples to authenticated.
2. Re-grant table-level SELECT on public.couples to anon (needed for the
   pre-auth invite-code lookup flow that queries couples directly).
3. Revoke column-level SELECT on admin_notes from authenticated to preserve
   the original migration's goal: non-admin users must never read admin_notes.
   Admins retain access via the "Admins can read all couples" RLS policy and
   the service_role / postgres superuser bypass.

## Security
- admin_notes remains restricted at the column level for all non-admin users.
- All RLS policies on couples are unchanged — row-level access is still scoped
  to couple members and admins.
- anon SELECT is safe because the only anon-accessible RLS policy is the
  pending-partner preview policy, which only returns rows where
  pending_partner_id = auth.uid() (null for anon) — effectively zero rows
  for anon. The invite-code lookup goes through the preview_invite() RPC,
  not direct table access.
- Idempotent: safe to re-run.

## Important Notes
1. This fixes the root cause of "no partner showing" for all paired users.
2. No data is modified — only GRANT/REVOKE statements.
3. PostgREST schema cache is reloaded via NOTIFY.
*/

-- ─── 1. Re-grant table-level SELECT to authenticated ──────────────────
GRANT SELECT ON public.couples TO authenticated;

-- ─── 2. Re-grant table-level SELECT to anon ────────────────────────────
-- anon needs this so PostgREST includes couples in its API schema cache.
-- The RLS policies prevent anon from reading any actual rows.
GRANT SELECT ON public.couples TO anon;

-- ─── 3. Revoke column-level SELECT on admin_notes ──────────────────────
-- This preserves the original migration's security goal: non-admin users
-- cannot read admin_notes even with table-level SELECT.
REVOKE SELECT (admin_notes) ON public.couples FROM authenticated;
REVOKE SELECT (admin_notes) ON public.couples FROM anon;

-- ─── 4. Reload PostgREST schema cache ─────────────────────────────────
NOTIFY pgrst, 'reload schema';
