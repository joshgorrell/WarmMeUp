/*
# Debug: Test extension check inside EXISTS (docs pattern)
*/
DROP POLICY IF EXISTS "debug topic membership select" ON realtime.messages;
DROP POLICY IF EXISTS "debug topic membership insert" ON realtime.messages;

-- SELECT: extension check INSIDE EXISTS (as docs show)
CREATE POLICY "debug ext inside exists select"
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
    AND realtime.messages.extension = 'presence'
  )
);

DROP POLICY IF EXISTS "debug ext inside exists insert" ON realtime.messages;
CREATE POLICY "debug ext inside exists insert"
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
    AND realtime.messages.extension = 'presence'
  )
);
