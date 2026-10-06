#!/usr/bin/env node
/**
 * Public vs Private Presence Event Delivery Test
 *
 * Tests whether an outsider subscribing to a PUBLIC channel with the same
 * topic name as a PRIVATE presence channel can:
 *   1. Receive presence events from the private channel's members
 *   2. Inject presence state into the private channel
 *
 * The test uses the SAME topic string for both channels:
 *   - Member A1: subscribes as PRIVATE (config: { private: true })
 *   - Outsider B1: subscribes as PUBLIC (no private config)
 *
 * If public and private channels share presence state, B1 would see A1's
 * presence and A1 would see B1's. If they are isolated, neither sees the other.
 *
 * Usage:
 *   node scripts/test-presence-public-private.cjs <a1-email> <b1-email> <coupleA-id>
 */
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'TestPass123!';

const args = process.argv.slice(2);
if (args.length < 3) {
  console.error('Usage: node script.js <a1-email> <b1-email> <coupleA-id>');
  process.exit(2);
}

const a1Email = args[0];
const b1Email = args[1];
const coupleAId = args[2];

function subscribeWithTimeout(channel, userId, timeoutMs = 15000) {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) { settled = true; resolve({ status: 'TIMEOUT' }); }
    }, timeoutMs);
    channel.subscribe(async (status, err) => {
      if (settled) return;
      if (status === 'SUBSCRIBED') {
        settled = true; clearTimeout(timer);
        try { await channel.track({ user_id: userId, online_at: new Date().toISOString() }); } catch(e) {}
        resolve({ status: 'SUBSCRIBED' });
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        settled = true; clearTimeout(timer);
        resolve({ status, error: err?.message || 'no error detail' });
      }
    });
  });
}

async function main() {
  console.log('=== Public vs Private Presence Event Delivery Test ===\n');

  const clientA1 = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, detectSessionInUrl: false }
  });
  const clientB1 = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, detectSessionInUrl: false }
  });

  const { data: a1Auth, error: a1Err } = await clientA1.auth.signInWithPassword({
    email: a1Email, password: TEST_PASSWORD
  });
  if (a1Err) throw new Error(`A1 auth failed: ${a1Err.message}`);
  console.log(`A1: ${a1Auth.user.id}`);

  const { data: b1Auth, error: b1Err } = await clientB1.auth.signInWithPassword({
    email: b1Email, password: TEST_PASSWORD
  });
  if (b1Err) throw new Error(`B1 auth failed: ${b1Err.message}`);
  console.log(`B1: ${b1Auth.user.id}`);

  const topic = `presence:couple_${coupleAId}`;
  console.log(`Topic: ${topic}\n`);

  // Track presence events received by each client
  const a1PresenceEvents = [];
  const b1PresenceEvents = [];

  // Step 1: A1 subscribes as PRIVATE and tracks
  console.log('--- Step 1: A1 subscribes as PRIVATE ---');
  const chA1Private = clientA1.channel(topic, { config: { private: true } });
  chA1Private.on('presence', { event: 'sync' }, () => {
    const state = chA1Private.presenceState();
    const keys = Object.keys(state);
    a1PresenceEvents.push({ time: Date.now(), keys, state: JSON.stringify(state).slice(0, 200) });
  });
  const a1Result = await subscribeWithTimeout(chA1Private, a1Auth.user.id);
  console.log(`A1 private subscription: ${a1Result.status} ${a1Result.error || ''}`);

  if (a1Result.status !== 'SUBSCRIBED') {
    console.log('FAIL: A1 could not subscribe to private channel');
    process.exit(1);
  }

  // Wait for A1's presence to settle
  await new Promise(r => setTimeout(r, 2000));
  const a1StateAfterOwnTrack = chA1Private.presenceState();
  console.log(`A1 presence state (own): ${Object.keys(a1StateAfterOwnTrack).length} entries`);

  // Step 2: B1 subscribes as PUBLIC to the SAME topic
  console.log('\n--- Step 2: B1 subscribes as PUBLIC to same topic ---');
  const chB1Public = clientB1.channel(topic);
  chB1Public.on('presence', { event: 'sync' }, () => {
    const state = chB1Public.presenceState();
    const keys = Object.keys(state);
    b1PresenceEvents.push({ time: Date.now(), keys, state: JSON.stringify(state).slice(0, 200) });
  });
  const b1Result = await subscribeWithTimeout(chB1Public, b1Auth.user.id);
  console.log(`B1 public subscription: ${b1Result.status} ${b1Result.error || ''}`);

  // Wait for presence sync
  await new Promise(r => setTimeout(r, 3000));

  // Step 3: Check what B1 (public) sees
  console.log('\n--- Step 3: Check what B1 (public) sees ---');
  const b1State = chB1Public.presenceState();
  const b1Keys = Object.keys(b1State);
  console.log(`B1 (public) presence entries: ${b1Keys.length}`);
  console.log(`B1 (public) presence keys: ${JSON.stringify(b1Keys)}`);

  // Check if B1 can see A1's presence
  let b1SeesA1 = false;
  for (const key of b1Keys) {
    const metas = b1State[key];
    if (metas && metas.some(m => m.user_id === a1Auth.user.id)) {
      b1SeesA1 = true;
    }
  }
  console.log(`B1 (public) can see A1's presence: ${b1SeesA1 ? 'YES — LEAK!' : 'NO — isolated'}`);

  // Step 4: Check what A1 (private) sees after B1 tracked on public
  console.log('\n--- Step 4: Check what A1 (private) sees after B1 tracked ---');
  const a1StateAfterB1 = chA1Private.presenceState();
  const a1KeysAfterB1 = Object.keys(a1StateAfterB1);
  console.log(`A1 (private) presence entries: ${a1KeysAfterB1.length}`);
  console.log(`A1 (private) presence keys: ${JSON.stringify(a1KeysAfterB1)}`);

  let a1SeesB1 = false;
  for (const key of a1KeysAfterB1) {
    const metas = a1StateAfterB1[key];
    if (metas && metas.some(m => m.user_id === b1Auth.user.id)) {
      a1SeesB1 = true;
    }
  }
  console.log(`A1 (private) can see B1's presence: ${a1SeesB1 ? 'YES — LEAK!' : 'NO — isolated'}`);

  // Step 5: B1 attempts to track on the public channel and we check if A1 sees it
  console.log('\n--- Step 5: B1 tracks on public, check if A1 receives it ---');
  try {
    await chB1Public.track({ user_id: b1Auth.user.id, online_at: new Date().toISOString(), injected: true });
    console.log('B1 tracked on public channel');
  } catch (e) {
    console.log(`B1 track failed: ${e.message}`);
  }

  await new Promise(r => setTimeout(r, 3000));

  const a1FinalState = chA1Private.presenceState();
  const a1FinalKeys = Object.keys(a1FinalState);
  let a1SeesB1Final = false;
  for (const key of a1FinalKeys) {
    const metas = a1FinalState[key];
    if (metas && metas.some(m => m.user_id === b1Auth.user.id)) {
      a1SeesB1Final = true;
    }
  }
  console.log(`A1 (private) sees B1 after B1 tracked on public: ${a1SeesB1Final ? 'YES — INJECTION!' : 'NO — isolated'}`);

  // Step 6: Summary
  console.log('\n=== EVENT DELIVERY TEST SUMMARY ===\n');
  console.log(`1. Outsider (B1 public) sees member (A1 private) presence: ${b1SeesA1 ? 'YES — LEAK' : 'NO — isolated'}`);
  console.log(`2. Member (A1 private) sees outsider (B1 public) presence: ${a1SeesB1 ? 'YES — LEAK' : 'NO — isolated'}`);
  console.log(`3. Outsider (B1 public) can inject into member (A1 private): ${a1SeesB1Final ? 'YES — INJECTION' : 'NO — isolated'}`);

  if (!b1SeesA1 && !a1SeesB1 && !a1SeesB1Final) {
    console.log('\nPASS: Public and private channels with the same topic are fully isolated.');
    console.log('Presence events do not cross between public and private channels.');
  } else {
    console.log('\nFAIL: Presence state leaks between public and private channels!');
  }

  // Print all presence events received
  console.log(`\nA1 (private) received ${a1PresenceEvents.length} presence sync events`);
  console.log(`B1 (public) received ${b1PresenceEvents.length} presence sync events`);

  // Cleanup
  await chA1Private.unsubscribe();
  clientA1.removeChannel(chA1Private);
  await chB1Public.unsubscribe();
  clientB1.removeChannel(chB1Public);

  process.exit(0);
}

main().catch(err => { console.error('\nFATAL:', err.message); process.exit(2); });
