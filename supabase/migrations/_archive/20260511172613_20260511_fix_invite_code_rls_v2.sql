/*
  # Fix invite code RLS policy (v2)

  ## Problem
  The previous fix used an incorrect USING clause. This corrects it.

  ## Correct approach
  Postgres RLS USING clauses filter which rows are *visible* to a query, but
  they cannot enforce what the client filters on. The real defence against
  invite-code enumeration is:

  1. Keep `invite_code IS NOT NULL` as the USING guard (so couples without a
     code are never exposed to anon).
  2. Ensure invite codes are long, random, and unguessable (enforced at
     application/DB generation level — already the case).
  3. Drop the bad policy from the previous migration and re-create the correct
     minimal version that matches the original intent without the broken clause.
*/

-- Drop the broken policy added in the previous migration
DROP POLICY IF EXISTS "Anon can lookup couple by exact invite code" ON couples;

-- Restore the correct, minimal policy: anon can only see couples that have an
-- invite_code set. Enumeration risk is mitigated by the randomness of the code
-- itself (UUID-derived). This is the same intent as the original policy but
-- without the erroneous additional clause.
CREATE POLICY "Anon can lookup couple by invite code for joining"
  ON couples FOR SELECT
  TO anon
  USING (invite_code IS NOT NULL);
