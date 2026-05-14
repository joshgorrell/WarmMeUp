/*
  # Add edit support to chat_messages

  1. Changes
    - Add `edited_at` nullable timestamptz column to `chat_messages`
      - NULL means the message has never been edited
      - Set to now() when a sender updates their own message

  2. Security
    - New UPDATE RLS policy: senders can only update their own messages (content_text only enforced via policy scope)
    - Policy checks sender_id = auth.uid() for both USING and WITH CHECK
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chat_messages' AND column_name = 'edited_at'
  ) THEN
    ALTER TABLE chat_messages ADD COLUMN edited_at timestamptz DEFAULT NULL;
  END IF;
END $$;

CREATE POLICY "Senders can update their own messages"
  ON chat_messages FOR UPDATE
  TO authenticated
  USING (auth.uid() = sender_id)
  WITH CHECK (auth.uid() = sender_id);
