/*
  # Fix invite code lookup for active solo couples

  ## Summary
  After migration 20260520202602 set `active = true` for all solo couples (no partner yet),
  the RLS policies that gate invite code lookups by `active = false` broke the entire pairing
  flow. Partners could no longer find a couple row by invite code because every solo couple
  is now `active = true`. This migration replaces those policies so that a couple is
  readable by invite code when it has no partner yet (user_b_id IS NULL), regardless of
  the active flag.

  ## Changes

  ### Security (RLS policy replacements on `couples`)
  - "Anon can lookup pending couple by invite code" — updated to allow lookup when
    `invite_code IS NOT NULL AND user_b_id IS NULL` (was `active = false`)
  - "Authenticated users can lookup pending couple by invite code" — same condition update

  ## Notes
  1. Active-but-solo couples (active = true, user_b_id = null) are now correctly visible
     to prospective partners scanning by code.
  2. Active couples that already have a partner (user_b_id IS NOT NULL) remain private —
     only the two members can read them.
  3. The self-pairing guard on UPDATE is unchanged.
*/

-- ─── Fix anon SELECT policy ────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Anon can lookup pending couple by invite code" ON couples;
DROP POLICY IF EXISTS "Anon can lookup couple by invite code for joining" ON couples;

CREATE POLICY "Anon can lookup pending couple by invite code"
  ON couples FOR SELECT
  TO anon
  USING (invite_code IS NOT NULL AND user_b_id IS NULL);

-- ─── Fix authenticated SELECT policy ──────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can lookup pending couple by invite code" ON couples;
DROP POLICY IF EXISTS "Authenticated users can lookup couple by invite code for joining" ON couples;

CREATE POLICY "Authenticated users can lookup pending couple by invite code"
  ON couples FOR SELECT
  TO authenticated
  USING (
    (auth.uid() = user_a_id OR auth.uid() = user_b_id)
    OR
    (invite_code IS NOT NULL AND user_b_id IS NULL)
  );
