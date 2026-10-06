/*
# Debug: Test simplest possible realtime policy
Temporary diagnostic to isolate why private channels reject legitimate members.
*/

DROP POLICY IF EXISTS "authenticated can read presence for own couple" ON realtime.messages;
DROP POLICY IF EXISTS "authenticated can track presence for own couple" ON realtime.messages;
DROP POLICY IF EXISTS "debug allow all presence" ON realtime.messages;

-- Simplest possible: allow all authenticated users to read/write presence
CREATE POLICY "debug allow all presence"
ON realtime.messages
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "debug allow all insert" ON realtime.messages;
CREATE POLICY "debug allow all insert"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (true);