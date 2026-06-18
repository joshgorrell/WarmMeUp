-- Fix Delete History to remove ALL couple data regardless of which partner owns each row.

-- chat_messages: replace sender-only policy with couple-scoped policy
DROP POLICY IF EXISTS "Senders can delete their own messages" ON chat_messages;
CREATE POLICY "Couple members can delete chat messages" ON chat_messages FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM couples
    WHERE couples.id = chat_messages.couple_id
      AND (couples.user_a_id = auth.uid() OR couples.user_b_id = auth.uid())
  ));

-- interactions: no DELETE policy existed at all — add couple-scoped one
DROP POLICY IF EXISTS "Couple members can delete interactions" ON interactions;
CREATE POLICY "Couple members can delete interactions" ON interactions FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM couples
    WHERE couples.id = interactions.couple_id
      AND (couples.user_a_id = auth.uid() OR couples.user_b_id = auth.uid())
  ));

-- media_reactions: replace user-only policy with couple-scoped policy
DROP POLICY IF EXISTS "Users can delete own media reactions" ON media_reactions;
CREATE POLICY "Couple members can delete media reactions" ON media_reactions FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM couples
    WHERE couples.id = media_reactions.couple_id
      AND (couples.user_a_id = auth.uid() OR couples.user_b_id = auth.uid())
  ));

-- activity_views: replace user-only policy with couple-scoped policy
DROP POLICY IF EXISTS "Users can delete own activity views" ON activity_views;
CREATE POLICY "Couple members can delete activity views" ON activity_views FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM couples
    WHERE couples.id = activity_views.couple_id
      AND (couples.user_a_id = auth.uid() OR couples.user_b_id = auth.uid())
  ));
