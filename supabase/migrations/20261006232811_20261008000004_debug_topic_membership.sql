/*
# Debug: Test topic + membership without extension check
*/
DROP POLICY IF EXISTS "debug presence ext only" ON realtime.messages;
DROP POLICY IF EXISTS "debug insert ext only" ON realtime.messages;

-- Test: membership check via topic, no extension filter
CREATE POLICY "debug topic membership select"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.couples c
    WHERE c.active = true
    AND (c.user_a_id = auth.uid() OR c.user_b_id = auth.uid())
    AND realtime.topic() LIKE '%' || 'presence:couple_' || c.id::text
  )
);

DROP POLICY IF EXISTS "debug topic membership insert" ON realtime.messages;
CREATE POLICY "debug topic membership insert"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.couples c
    WHERE c.active = true
    AND (c.user_a_id = auth.uid() OR c.user_b_id = auth.uid())
    AND realtime.topic() LIKE '%' || 'presence:couple_' || c.id::text
  )
);