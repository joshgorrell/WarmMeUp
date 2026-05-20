/*
  # Harden Invite Code Flow

  ## Summary
  Strengthens the partner connection / invite code system with expiry tracking,
  usage stamping, and tighter database-level security rules.

  ## Modified Tables
  - `couples`
    - `invite_code_expires_at` (timestamptz, nullable) — set to 7 days after code
      generation. NULL on legacy rows (treated as never-expired for backwards compat).
      Reset to 7 days from now on every code refresh.
    - `invite_code_used_at` (timestamptz, nullable) — stamped when User B successfully
      joins. Used to distinguish "already used" from "expired" error states.

  ## Security Changes
  - DROP + REPLACE the loose anon/authenticated "invite_code IS NOT NULL" SELECT
    policies with tighter versions that also require `active = false` (active couples
    are no longer readable by code lookup — only members can see active couples).
  - Add DB-level UPDATE CHECK: a user cannot set themselves as user_b_id on a couple
    where they are already user_a_id (prevents self-pairing at the DB layer).
  - Add partial unique index: a user can only appear as user_b_id in one active couple.

  ## Notes
  1. invite_code_expires_at is nullable — NULL means "no expiry set yet" (legacy rows).
     Client code treats NULL as non-expired to preserve backwards compatibility.
  2. Existing active couples are NOT given an expiry; it only applies to pending codes.
*/

-- Add invite_code_expires_at column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'couples' AND column_name = 'invite_code_expires_at'
  ) THEN
    ALTER TABLE couples ADD COLUMN invite_code_expires_at timestamptz;
  END IF;
END $$;

-- Backfill: give existing inactive (pending) couples a 7-day window from now
UPDATE couples
SET invite_code_expires_at = now() + interval '7 days'
WHERE active = false AND invite_code_expires_at IS NULL;

-- Add invite_code_used_at column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'couples' AND column_name = 'invite_code_used_at'
  ) THEN
    ALTER TABLE couples ADD COLUMN invite_code_used_at timestamptz;
  END IF;
END $$;

-- Backfill: stamp invite_code_used_at on already-active (connected) couples
UPDATE couples
SET invite_code_used_at = COALESCE(disconnected_at, created_at)
WHERE active = true AND invite_code_used_at IS NULL;

-- Partial unique index: each user may only be user_b_id in one active couple
CREATE UNIQUE INDEX IF NOT EXISTS couples_user_b_active_unique
  ON couples (user_b_id)
  WHERE active = true AND user_b_id IS NOT NULL;

-- Partial unique index: each user may only be user_a_id in one inactive couple
CREATE UNIQUE INDEX IF NOT EXISTS couples_user_a_inactive_unique
  ON couples (user_a_id)
  WHERE active = false;

-- ─── Tighten anon SELECT policy ─────────────────────────────────────────────
DROP POLICY IF EXISTS "Anon can lookup couple by exact invite code" ON couples;
DROP POLICY IF EXISTS "Anyone can lookup couple by invite code for joining" ON couples;

CREATE POLICY "Anon can lookup pending couple by invite code"
  ON couples FOR SELECT
  TO anon
  USING (invite_code IS NOT NULL AND active = false);

-- ─── Tighten authenticated SELECT policy for code lookup ────────────────────
DROP POLICY IF EXISTS "Authenticated users can lookup couple by invite code for joining" ON couples;

CREATE POLICY "Authenticated users can lookup pending couple by invite code"
  ON couples FOR SELECT
  TO authenticated
  USING (
    (auth.uid() = user_a_id OR auth.uid() = user_b_id)
    OR
    (invite_code IS NOT NULL AND active = false)
  );

-- ─── Add self-pairing guard to UPDATE policy ────────────────────────────────
DROP POLICY IF EXISTS "Couple members can update their couple" ON couples;

CREATE POLICY "Couple members can update their couple"
  ON couples FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_a_id OR auth.uid() = user_b_id)
  WITH CHECK (
    (auth.uid() = user_a_id OR auth.uid() = user_b_id)
    AND
    NOT (auth.uid() = user_a_id AND user_b_id = auth.uid())
  );
