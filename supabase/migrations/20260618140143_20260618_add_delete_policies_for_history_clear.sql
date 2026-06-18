-- Allow couple members to delete all wishes in their couple (for Delete History)
DROP POLICY IF EXISTS "Users can delete own wishes" ON wishes;
CREATE POLICY "Couple members can delete wishes" ON wishes FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM couples
    WHERE couples.id = wishes.couple_id
      AND (couples.user_a_id = auth.uid() OR couples.user_b_id = auth.uid())
  ));

-- Allow couple members to delete activity_events in their couple
CREATE POLICY "Couple members can delete activity events" ON activity_events FOR DELETE
  TO authenticated
  USING (auth.uid() = actor_user_id OR auth.uid() = target_user_id);

-- Allow users to delete their own activity_views
CREATE POLICY "Users can delete own activity views" ON activity_views FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
