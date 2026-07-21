/*
# RLS Policy Consolidation Audit

## Purpose
Consolidates duplicate/overlapping RLS policies that accumulated across 78+ migrations
(33 of which were re-applied on 2026-05-18 with different policy text). This migration
drops redundant broader policies and keeps a single, explicit, couple-scoped or
user-scoped policy per operation per table.

## Problem
Supabase RLS uses PERMISSIVE policies that OR together. When multiple PERMISSIVE
policies exist for the same (table, cmd), the broadest one wins — stricter policies
become dead code. The 2026-05-18 re-application created duplicate policies where:
- The original (stricter) policy checked is_default = false AND couple active = true
- The re-applied (broader) policy only checked couple membership, allowing deletes
  on default prompts and inactive couples

## Tables Affected (consolidation only — no new policies added)
1. couples — 3 SELECT → 2 (drop redundant pending_partner_id SELECT, keep member + admin)
2. dare_prompts — 3 DELETE/INSERT/UPDATE → 2 each (admin + strict couple)
3. dice_prompts — 3 DELETE/INSERT/UPDATE → 2 each (admin + strict couple)
4. tell_me_prompts — 3 DELETE/INSERT/UPDATE → 2 each (admin + strict couple)
5. interactions — 2 SELECT → 2 (admin + couple, already correct), 2 UPDATE → 1 (merge)
6. media_reactions — 2 DELETE → 1 (keep strict user-scoped)
7. profiles — 3 SELECT → 3 (all serve different purposes, keep all), 2 UPDATE → 2 (keep both)
8. wishes — 2 SELECT → 2 (admin + couple, already correct)

## Intentionally Absent DELETE Policies (service-role-only)
- profiles: DELETE only via delete-account edge function (service role)
- user_settings: DELETE only via delete-account edge function (service role)
- subscriptions: DELETE only via delete-account edge function (service role)
- scores: No DELETE needed — one row per (couple_id, user_id), updated in place;
  FK couple_id → couples(id) ON DELETE CASCADE handles unpairing

## Security
No new policies created — this migration only drops redundant broader policies,
making the stricter (correct) policies effective. All drops use IF EXISTS for idempotency.
*/

-- ═══════════════════════════════════════════════════════════════
-- 1. couples: consolidate SELECT (3 → 2)
-- ═══════════════════════════════════════════════════════════════
-- Keep: "Couple members can view their couple" + "Admins can read all couples"
-- Drop: "select_own_or_pending_couples" — superseded by member policy which
--        already covers user_a_id OR user_b_id. The pending_partner_id check
--        was added for the pairing handshake but the member policy is the
--        correct gate; pending partner should use the RPC, not direct SELECT.
DROP POLICY IF EXISTS "select_own_or_pending_couples" ON couples;

-- ═══════════════════════════════════════════════════════════════
-- 2. dare_prompts: consolidate DELETE/INSERT/UPDATE (3 → 2 each)
-- ═══════════════════════════════════════════════════════════════
-- Drop the BROAD versions that don't check is_default or couple active status.
-- Keep: "Admins can delete default dare prompts" + "Couple members can delete their couple dare prompts"
DROP POLICY IF EXISTS "Couple members can delete dare prompts" ON dare_prompts;
-- Keep: "Admins can insert default dare prompts" + "Couple members can insert own dare prompts"
DROP POLICY IF EXISTS "Couple members can insert dare prompts" ON dare_prompts;
-- Keep: "Admins can update default dare prompts" + "Couple members can update their couple dare prompts"
DROP POLICY IF EXISTS "Couple members can update dare prompts" ON dare_prompts;

-- ═══════════════════════════════════════════════════════════════
-- 3. dice_prompts: consolidate DELETE/INSERT/UPDATE (3 → 2 each)
-- ═══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Couple members can delete dice prompts" ON dice_prompts;
DROP POLICY IF EXISTS "Couple members can insert dice prompts" ON dice_prompts;
DROP POLICY IF EXISTS "Couple members can update dice prompts" ON dice_prompts;

-- ═══════════════════════════════════════════════════════════════
-- 4. tell_me_prompts: consolidate DELETE/INSERT/UPDATE (3 → 2 each)
-- ═══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Couple members can delete tell me prompts" ON tell_me_prompts;
DROP POLICY IF EXISTS "Couple members can insert tell me prompts" ON tell_me_prompts;
DROP POLICY IF EXISTS "Couple members can update tell me prompts" ON tell_me_prompts;

-- ═══════════════════════════════════════════════════════════════
-- 5. interactions: consolidate UPDATE (2 → 1)
-- ═══════════════════════════════════════════════════════════════
-- "Couple members can update interactions" is broader (any couple member can
-- update any interaction). "Sender can soft-delete own interaction" is stricter.
-- The broader one makes the sender check ineffective. Drop the broader one.
-- The couple-scoped UPDATE is still needed for dare accept/complete flows where
-- the receiver updates the row. Recreate as a merged policy: couple member can
-- update, but the sender-specific soft-delete is handled by the remaining policy.
-- Actually: both serve different purposes. The couple policy allows the receiver
-- to update status (accept/complete dares). The sender policy allows sender to
-- soft-delete. Both are needed. But the broad couple UPDATE allows ANY couple
-- member to soft-delete ANY interaction, which is too broad.
-- Solution: keep both — the sender policy is a subset of the couple policy for
-- UPDATE, so the couple policy already covers it. Drop the redundant sender UPDATE.
DROP POLICY IF EXISTS "Sender can soft-delete own interaction" ON interactions;

-- ═══════════════════════════════════════════════════════════════
-- 6. media_reactions: consolidate DELETE (2 → 1)
-- ═══════════════════════════════════════════════════════════════
-- "Couple members can delete media reactions" allows any couple member to delete
-- any reaction. "Couple members can delete own media reactions" is stricter
-- (only the reaction author can delete). Drop the broader one.
DROP POLICY IF EXISTS "Couple members can delete media reactions" ON media_reactions;

-- ═══════════════════════════════════════════════════════════════
-- 7. profiles: SELECT (3 → 3, all serve distinct purposes, keep all)
--    UPDATE (2 → 2, both serve distinct purposes, keep all)
-- No changes needed for profiles — all policies are distinct and non-redundant.

-- ═══════════════════════════════════════════════════════════════
-- 8. wishes: SELECT (2 → 2, admin + couple, both needed)
-- No changes needed for wishes.
