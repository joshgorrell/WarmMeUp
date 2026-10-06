/*
# Fix Presence Channel RLS Policy - Topic Format Mismatch

## Purpose
The previous migration (20261006224232) created RLS policies on
`realtime.messages` for presence channel authorization. The policies used
`regexp_replace(realtime.topic(), '^presence:couple_', '')` to extract the
couple UUID from the topic string. This failed in the actual Realtime context
because `realtime.topic()` returns the topic with a `realtime:` prefix (e.g.
`realtime:presence:couple_<uuid>`), so the regex never matched and the UUID
cast failed — rejecting even legitimate couple members.

## Fix
Replace the regex-based UUID extraction with a `LIKE` suffix check:
the policy compares `realtime.topic() LIKE '%' || 'presence:couple_' || c.id::text`
This is prefix-agnostic: regardless of whether Realtime prefixes the topic
with `realtime:` or not, the suffix `presence:couple_<uuid>` will match.

## Security
- Same membership check: `c.active = true AND (c.user_a_id = auth.uid() OR
  c.user_b_id = auth.uid())`
- Same `extension = 'presence'` scoping
- Uses `auth.uid()` for identity
- Disconnected partners (couple `active = false`) are denied
*/

-- Drop old policies (regex-based, broken in Realtime context)
DROP POLICY IF EXISTS "authenticated can read presence for own couple" ON realtime.messages;
DROP POLICY IF EXISTS "authenticated can track presence for own couple" ON realtime.messages;

-- SELECT: Allow reading presence messages only for couples the user belongs to
CREATE POLICY "authenticated can read presence for own couple"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  extension = 'presence'
  AND EXISTS (
    SELECT 1
    FROM public.couples c
    WHERE c.active = true
    AND (c.user_a_id = auth.uid() OR c.user_b_id = auth.uid())
    AND realtime.topic() LIKE '%' || 'presence:couple_' || c.id::text
  )
);

-- INSERT: Allow tracking presence only for couples the user belongs to
CREATE POLICY "authenticated can track presence for own couple"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  extension = 'presence'
  AND EXISTS (
    SELECT 1
    FROM public.couples c
    WHERE c.active = true
    AND (c.user_a_id = auth.uid() OR c.user_b_id = auth.uid())
    AND realtime.topic() LIKE '%' || 'presence:couple_' || c.id::text
  )
);