/*
# Final Fix: Presence Channel RLS Policy

## Purpose
Secure presence channels so only active couple members can subscribe and
track presence. The chat screen uses `presence:couple_<uuid>` private channels
to show online status.

## Root Cause of Previous Failures
Two issues were found and fixed:

1. **Topic format mismatch**: The original migration used
   `regexp_replace(realtime.topic(), '^presence:couple_', '')` to extract a UUID.
   This was replaced with `LIKE '%' || 'presence:couple_' || c.id::text` which
   matches the topic suffix regardless of any prefix Realtime adds internally.

2. **Extension column check breaks authorization**: The `extension = 'presence'`
   filter caused all private channel joins to be rejected — even for legitimate
   members. During Realtime's authorization probe, the `extension` column on
   the test row does not contain `'presence'`, so any policy that filters on
   this value will deny the join. The extension filter has been removed entirely.
   The topic-based membership check (`realtime.topic() LIKE '%presence:couple_' ||
   c.id::text`) is sufficient to scope the policy to presence channels, since
   the topic name itself contains `presence:couple_`.

## Verification
WebSocket tests confirmed:
- Member subscribing to own couple's private channel: SUBSCRIBED (PASS)
- Outsider subscribing to foreign couple's private channel: CHANNEL_ERROR (PASS)
- Public channels still work (Allow public access is ON)

## Security
- RLS on `realtime.messages` is enabled (Supabase default).
- SELECT policy: only active couple members can read presence messages on
  their own couple's channel.
- INSERT policy: only active couple members can track presence on their own
  couple's channel.
- Membership check: `c.active = true AND (c.user_a_id = auth.uid() OR
  c.user_b_id = auth.uid())`
- Topic check: `realtime.topic() LIKE '%presence:couple_' || c.id::text`
  ensures the user is only authorized for their own couple's presence channel.
- Uses `auth.uid()` for identity, never `current_user`.
- Disconnected partners (couple `active = false`) are denied access.
- Private channels (`config: { private: true }`) enforce these policies
  regardless of the "Allow public access" dashboard setting.
*/

-- Drop all debug and previous policies
DROP POLICY IF EXISTS "debug ext inside exists select" ON realtime.messages;
DROP POLICY IF EXISTS "debug ext inside exists insert" ON realtime.messages;
DROP POLICY IF EXISTS "debug topic membership select" ON realtime.messages;
DROP POLICY IF EXISTS "debug topic membership insert" ON realtime.messages;
DROP POLICY IF EXISTS "debug presence ext only" ON realtime.messages;
DROP POLICY IF EXISTS "debug insert ext only" ON realtime.messages;
DROP POLICY IF EXISTS "debug allow all presence" ON realtime.messages;
DROP POLICY IF EXISTS "debug allow all insert" ON realtime.messages;
DROP POLICY IF EXISTS "authenticated can read presence for own couple" ON realtime.messages;
DROP POLICY IF EXISTS "authenticated can track presence for own couple" ON realtime.messages;

-- SELECT: Allow reading presence messages only for couples the user belongs to
CREATE POLICY "authenticated can read presence for own couple"
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

-- INSERT: Allow tracking presence only for couples the user belongs to
CREATE POLICY "authenticated can track presence for own couple"
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