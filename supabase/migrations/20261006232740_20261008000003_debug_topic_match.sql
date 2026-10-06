/*
# Debug: Test topic matching only
*/
DROP POLICY IF EXISTS "debug allow all presence" ON realtime.messages;
DROP POLICY IF EXISTS "debug allow all insert" ON realtime.messages;

-- Test: check extension = 'presence' only
CREATE POLICY "debug presence ext only"
ON realtime.messages
FOR SELECT
TO authenticated
USING (extension = 'presence');

DROP POLICY IF EXISTS "debug insert ext only" ON realtime.messages;
CREATE POLICY "debug insert ext only"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (extension = 'presence');