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
connects to a channel with `{ config: { private: true } }`. Realtime performs
a probe query on the table and rolls it back; the RLS policy must return a row
for the client to be authorized.

## Couple Membership Check
A user is an active member of a couple if:
- `couples.user_a_id = auth.uid()` OR `couples.user_b_id = auth.uid()`
- AND `couples.active = true`

The topic is `presence:couple_<uuid>`. The policy matches it with
`realtime.topic() LIKE '%presence:couple_' || c.id::text` so the couple
UUID is extracted from the topic suffix and compared against the couples
the caller belongs to.

## Why No `extension` Filter
The Supabase docs show `realtime.messages.extension = 'presence'` inside
RLS policies. However, during Realtime's authorization probe the probe row
does not have `extension = 'presence'`, so any policy that filters on this
value rejects even legitimate members. The topic-based check alone is
sufficient -- the topic name `presence:couple_<uuid>` already scopes the
policy to presence channels.

## "Allow Public Access" Setting
Private channels with `config: { private: true }` enforce RLS policies
regardless of the "Allow public access" Realtime dashboard setting. That
setting only controls whether public channels (without `private: true`)
are allowed. The app's 12 other Realtime subscriptions are public Postgres
Changes channels that rely on table-level RLS, so do NOT disable "Allow
public access" without first converting those channels to private.

## Security
- RLS is already enabled on `realtime.messages` (Supabase default).
- SELECT policy: only active couple members can read presence messages on
  their own couple's channel.
- INSERT policy: only active couple members can track presence on their
  own couple's channel.
- Uses `auth.uid()` for identity, never `current_user`.
- Disconnected partners (couple `active = false`) are denied access.

## Verification
WebSocket tests with real authenticated sessions confirmed:
- Member subscribing to own couple's private channel: SUBSCRIBED (PASS)
- Outsider subscribing to foreign couple's private channel: CHANNEL_ERROR (PASS)
- Track on existing connection after couple deactivated: TRACKED (cached auth)
- Fresh client (new WebSocket) after deactivation: CHANNEL_ERROR (PASS)
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
