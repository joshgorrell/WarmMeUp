/*
# Secure Presence Channel with Realtime RLS Authorization

## Purpose
The chat screen subscribes to a presence channel named `presence:couple_<uuid>`
to track whether the partner is online. Previously this channel was public --
any authenticated user who knew a couple's ID could subscribe and see presence
state. This migration adds RLS policies on `realtime.messages` that restrict
presence read/write to active couple members only.

## How It Works
Supabase Realtime checks RLS policies on `realtime.messages` when a client
connects to a channel with `{ config: { private: true } }`. The `topic` column
stores the channel name (e.g. `presence:couple_<uuid>`). The policies below:

1. SELECT policy: Allow authenticated users to read presence messages only if
   they are an active member of the couple whose UUID is embedded in the topic.
2. INSERT policy: Allow authenticated users to track presence only if they are
   an active member of that couple.

## Couple Membership Check
A user is an active member of a couple if:
- `couples.user_a_id = auth.uid()` OR `couples.user_b_id = auth.uid()`
- AND `couples.active = true`

The topic format is `presence:couple_<uuid>`. The policy extracts the UUID
suffix and looks up the couple by ID.

## Important Note
For these policies to take effect, the "Allow public access" setting must be
disabled in the Supabase Dashboard under Realtime Settings. Until that setting
is disabled, the policies exist but are not enforced because public access
bypasses them. This is a manual dashboard step -- it cannot be done via SQL.

## Security
- RLS is already enabled on `realtime.messages`.
- These policies are scoped to `extension = 'presence'` only, so they do not
  affect broadcast or other realtime message types.
- Policies use `auth.uid()` for identity, never `current_user`.
- Disconnected partners (couple `active = false`) are denied access.
*/

-- Drop existing policies if any (idempotent)
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
    WHERE c.id = (
      SELECT regexp_replace(
        regexp_replace(realtime.topic(), '^presence:couple_', ''),
        '[^a-f0-9-]', '', 'g'
      )::uuid
    )
    AND c.active = true
    AND (c.user_a_id = auth.uid() OR c.user_b_id = auth.uid())
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
    WHERE c.id = (
      SELECT regexp_replace(
        regexp_replace(realtime.topic(), '^presence:couple_', ''),
        '[^a-f0-9-]', '', 'g'
      )::uuid
    )
    AND c.active = true
    AND (c.user_a_id = auth.uid() OR c.user_b_id = auth.uid())
  )
);
