/*
  # Fix invite code lookup for newly-registered users

  ## Problem
  When a user signs up with a pendingCode, `completePendingJoin` runs immediately
  after signup while the user is authenticated. The existing authenticated SELECT
  policy on `couples` only shows rows where `auth.uid() = user_a_id OR user_b_id`,
  so a brand-new user (who is neither yet) gets zero rows back and the join silently
  fails — producing "invalid code" from the partner's perspective.

  ## Fix
  Add a second authenticated SELECT policy that allows any logged-in user to read a
  couple row when `invite_code IS NOT NULL`. This mirrors the existing anon policy
  but for the authenticated role, covering the brief window between signup and the
  join update.

  ## Security
  - Enumeration risk is the same as the anon policy: codes are random 6-char strings
    (~2.2B combinations) making brute-force impractical
  - The policy only allows SELECT; the actual join UPDATE is still gated by ownership
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'couples'
      AND policyname = 'Authenticated users can lookup couple by invite code for joining'
  ) THEN
    CREATE POLICY "Authenticated users can lookup couple by invite code for joining"
      ON couples FOR SELECT
      TO authenticated
      USING (invite_code IS NOT NULL);
  END IF;
END $$;
