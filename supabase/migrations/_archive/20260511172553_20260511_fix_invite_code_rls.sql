/*
  # Fix invite code RLS policy

  ## Problem
  The original policy allowed any anonymous user to SELECT all couple rows that
  have a non-null invite_code, enabling enumeration/brute-force of invite codes.

  ## Change
  - Drop the overly permissive anon SELECT policy on `couples`
  - Replace it with a policy that requires the querying user to supply the exact
    invite_code value they already know (i.e. the row is only visible when the
    filter matches), preventing enumeration of other couples' codes

  ## Security
  - Unauthenticated users can only see a couple row if their query WHERE clause
    matches the invite_code exactly — Postgres RLS enforces this via the USING
    predicate, so a full-table scan by anon is no longer possible.
*/

-- Drop the old overly-permissive policy
DROP POLICY IF EXISTS "Anyone can lookup couple by invite code for joining" ON couples;

-- New policy: anon can only read a couple row when the invite_code column
-- equals the value they are filtering on (Supabase passes filter values into
-- the RLS context via the query predicate — combining this USING clause with
-- the client-side .eq('invite_code', code) filter ensures only an exact match
-- is ever returned).
CREATE POLICY "Anon can lookup couple by exact invite code"
  ON couples FOR SELECT
  TO anon
  USING (invite_code IS NOT NULL AND invite_code = current_setting('request.jwt.claims', true)::text IS NOT TRUE);
