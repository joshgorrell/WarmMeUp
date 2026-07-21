-- Allow either partner to soft-delete (set deleted_at on) any chat message in their couple.
-- The previous sender-only policy blocked partners from removing each other's media.
DROP POLICY IF EXISTS "Senders can update their own messages" ON chat_messages;

CREATE POLICY "Couple members can update chat messages"
  ON chat_messages FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM couples
      WHERE couples.id = chat_messages.couple_id
        AND (couples.user_a_id = auth.uid() OR couples.user_b_id = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM couples
      WHERE couples.id = chat_messages.couple_id
        AND (couples.user_a_id = auth.uid() OR couples.user_b_id = auth.uid())
    )
  );
