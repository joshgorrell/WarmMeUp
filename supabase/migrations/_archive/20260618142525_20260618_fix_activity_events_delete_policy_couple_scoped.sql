-- Fix activity_events delete policy to be couple-scoped so either partner
-- can clear the full history, not just rows they personally originated.
DROP POLICY IF EXISTS "Couple members can delete activity events" ON activity_events;
CREATE POLICY "Couple members can delete activity events" ON activity_events FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM couples
    WHERE couples.id = activity_events.couple_id
      AND (couples.user_a_id = auth.uid() OR couples.user_b_id = auth.uid())
  ));
