/*
  # Add DELETE RLS policies for Points Reset

  ## Problem
  The "Reset Points" feature in account.tsx runs three queries:
    1. DELETE from point_events WHERE couple_id = X  → was silently failing (no DELETE policy)
    2. UPDATE scores SET points = 0 WHERE couple_id = X  → was succeeding (UPDATE policy exists)
    3. DELETE from monthly_scores WHERE couple_id = X  → was silently failing (no DELETE policy)

  Supabase RLS silently rejects operations with no matching policy, so the user sees
  no visible change even though the UI shows a success message.

  ## Changes
  1. New DELETE policy on `point_events`:
     - Authenticated couple members can delete rows where couple_id matches their couple
  2. New DELETE policy on `monthly_scores`:
     - Authenticated couple members can delete rows where couple_id matches their couple

  ## Security
  Both policies use the same couple membership check pattern as the existing SELECT
  policies on each table — an EXISTS subquery against the couples table checking
  user_a_id or user_b_id against auth.uid().
*/

-- ─── point_events: allow couple members to delete their own couple's events ───
CREATE POLICY "Couple members can delete point events"
  ON point_events FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM couples
      WHERE id = point_events.couple_id
        AND (user_a_id = auth.uid() OR user_b_id = auth.uid())
    )
  );

-- ─── monthly_scores: allow couple members to delete their own couple's records ─
CREATE POLICY "Couple members can delete monthly scores"
  ON monthly_scores FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM couples
      WHERE id = monthly_scores.couple_id
        AND (user_a_id = auth.uid() OR user_b_id = auth.uid())
    )
  );
