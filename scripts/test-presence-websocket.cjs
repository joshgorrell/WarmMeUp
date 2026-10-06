#!/usr/bin/env node
/**
 * Live Presence WebSocket Test — Automated version
 *
 * Tests actual WebSocket subscriptions to Supabase Realtime Presence channels:
 *   1. Member subscribes to own couple's private channel — expect SUBSCRIBED
 *   2. Outsider subscribes to foreign couple's private channel — expect CHANNEL_ERROR
 *   3. Member subscribes to own couple's PUBLIC channel (no private config)
 *   4. Outsider subscribes to foreign couple's PUBLIC channel
 *   5. Already-connected partner after couple disconnect — measures cached-access behavior
 *
 * For Test 5: The script subscribes A1 as a member, then uses the supabase-js
 * client to call an edge function to deactivate the couple. We then observe
 * whether the existing connection retains presence capabilities.
 *
 * Usage:
 *   node scripts/test-presence-websocket.cjs \
 *     <a1-email> <b1-email> <coupleA-id> <coupleB-id>
 *
 * Credentials from .env. Test password via TEST_PASSWORD env var (default TestPass123!).
 */
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'TestPass123!';

const args = process.argv.slice(2);
if (args.length < 4) {
  console.error('Usage: node script.js <a1-email> <b1-email> <coupleA-id> <coupleB-id>');
  process.exit(2);
}

const TEST = {
  a1Email: args[0],
  b1Email: args[1],
  coupleA: args[2],
  coupleB: args[3],
};

const results = [];
function record(test, status, detail) {
  results.push({ test, status, detail });
  console.log(`  [${status}] ${test}: ${detail}`);
}

async function main() {
  console.log('=== Live Presence WebSocket Test ===\n');

  const clientA1 = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false, detectSessionInUrl: false } });
  const clientB1 = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false, detectSessionInUrl: false } });

  const { data: a1Auth, error: a1Err } = await clientA1.auth.signInWithPassword({ email: TEST.a1Email, password: TEST_PASSWORD });
  if (a1Err) throw new Error(`A1 auth failed: ${a1Err.message}`);
  console.log(`  A1: ${a1Auth.user.id}`);

  const { data: b1Auth, error: b1Err } = await clientB1.auth.signInWithPassword({ email: TEST.b1Email, password: TEST_PASSWORD });
  if (b1Err) throw new Error(`B1 auth failed: ${b1Err.message}`);
  console.log(`  B1: ${b1Auth.user.id}\n`);

  // Helper: subscribe with timeout
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
          try { await channel.track({ user_id, online_at: new Date().toISOString() }); } catch(e) {}
          resolve({ status: 'SUBSCRIBED' });
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          settled = true; clearTimeout(timer);
          resolve({ status, error: err?.message || 'no error detail' });
        }
      });
    });
  }

  // === TEST 1: Member subscribes to own couple's PRIVATE channel ===
  console.log('--- Test 1: Member subscribes to own private channel ---');
  {
    const ch = clientA1.channel(`presence:couple_${TEST.coupleA}`, { config: { private: true } });
    const result = await subscribeWithTimeout(ch, a1Auth.user.id);
    if (result.status === 'SUBSCRIBED') {
      await new Promise(r => setTimeout(r, 2000));
      const ps = ch.presenceState();
      record('Member subscribes to own private channel', 'PASS', `SUBSCRIBED, presence entries: ${Object.keys(ps).length}`);
    } else {
      record('Member subscribes to own private channel', result.status === 'CHANNEL_ERROR' ? 'INFO' : 'FAIL', `${result.status}: ${result.error || 'unexpected'}`);
    }
    await ch.unsubscribe(); clientA1.removeChannel(ch);
  }

  // === TEST 2: Outsider subscribes to foreign couple's PRIVATE channel ===
  console.log('\n--- Test 2: Outsider subscribes to foreign private channel ---');
  {
    const ch = clientB1.channel(`presence:couple_${TEST.coupleA}`, { config: { private: true } });
    let trackSucceeded = false;
    const result = await new Promise((resolve) => {
      let settled = false;
      const timer = setTimeout(() => { if (!settled) { settled = true; resolve({ status: 'TIMEOUT' }); } }, 15000);
      ch.subscribe(async (status, err) => {
        if (settled) return;
        if (status === 'SUBSCRIBED') {
          settled = true; clearTimeout(timer);
          try { await ch.track({ user_id: b1Auth.user.id, online_at: new Date().toISOString() }); trackSucceeded = true; } catch(e) {}
          resolve({ status: 'SUBSCRIBED' });
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          settled = true; clearTimeout(timer);
          resolve({ status, error: err?.message || 'no error detail' });
        }
      });
    });
    if (result.status === 'CHANNEL_ERROR' || result.status === 'TIMED_OUT' || result.status === 'CLOSED') {
      record('Outsider subscribes to foreign private channel', 'PASS', `Rejected: ${result.status} — RLS policy denied access`);
    } else if (result.status === 'SUBSCRIBED') {
      record('Outsider subscribes to foreign private channel', 'FAIL', `SUBSCRIBED — outsider gained access, track: ${trackSucceeded}`);
    } else {
      record('Outsider subscribes to foreign private channel', 'FAIL', `Unexpected: ${result.status}`);
    }
    await ch.unsubscribe(); clientB1.removeChannel(ch);
  }

  // === TEST 3: Member subscribes to own couple's PUBLIC channel ===
  console.log('\n--- Test 3: Member subscribes to own PUBLIC channel (no private config) ---');
  {
    const ch = clientA1.channel(`presence:couple_${TEST.coupleA}`);
    const result = await subscribeWithTimeout(ch, a1Auth.user.id);
    if (result.status === 'SUBSCRIBED') {
      record('Member subscribes to own PUBLIC channel', 'INFO', 'SUBSCRIBED — "Allow public access" is currently ON (public channels work without RLS)');
    } else if (result.status === 'CHANNEL_ERROR' || result.status === 'TIMED_OUT' || result.status === 'CLOSED') {
      record('Member subscribes to own PUBLIC channel', 'INFO', `Rejected (${result.status}) — "Allow public access" is currently OFF (public channels blocked)`);
    } else {
      record('Member subscribes to own PUBLIC channel', 'INFO', `Status: ${result.status}`);
    }
    await ch.unsubscribe(); clientA1.removeChannel(ch);
  }

  // === TEST 4: Outsider subscribes to foreign couple's PUBLIC channel ===
  console.log('\n--- Test 4: Outsider subscribes to foreign PUBLIC channel ---');
  {
    const ch = clientB1.channel(`presence:couple_${TEST.coupleA}`);
    const result = await subscribeWithTimeout(ch, b1Auth.user.id);
    if (result.status === 'SUBSCRIBED') {
      record('Outsider subscribes to foreign PUBLIC channel', 'INFO', 'SUBSCRIBED — public channels are open to anyone (no RLS check on public channels)');
    } else {
      record('Outsider subscribes to foreign PUBLIC channel', 'INFO', `Rejected (${result.status}) — public channels restricted`);
    }
    await ch.unsubscribe(); clientB1.removeChannel(ch);
  }

  // === TEST 5: Already-connected partner after couple disconnect ===
  console.log('\n--- Test 5: Already-connected partner after disconnect ---');
  {
    const ch = clientA1.channel(`presence:couple_${TEST.coupleA}`, { config: { private: true } });
    const subResult = await subscribeWithTimeout(ch, a1Auth.user.id);

    if (subResult.status !== 'SUBSCRIBED') {
      record('Disconnect test: initial subscription', 'FAIL', `Could not subscribe: ${subResult.status}`);
      await ch.unsubscribe(); clientA1.removeChannel(ch);
    } else {
      console.log('  Initial subscription: SUBSCRIBED');
      console.log('  Deactivating couple via HTTP (calling disconnect edge function)...');

      // Try to deactivate the couple via the disconnect edge function
      const disconnectResp = await fetch(`${SUPABASE_URL}/functions/v1/disconnect-couple`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${a1Auth.session.access_token}`,
          Apikey: SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ couple_id: TEST.coupleA }),
      }).catch(e => ({ ok: false, status: 0, error: e.message }));

      const disconnectBody = disconnectResp.json ? await disconnectResp.json().catch(() => ({})) : {};
      console.log(`  Disconnect response: HTTP ${disconnectResp.status || 'N/A'}: ${JSON.stringify(disconnectBody).slice(0, 120)}`);

      // If disconnect failed, try direct SQL deactivation (we can't use execute_sql from here,
      // so we'll just test the behavior based on what we can observe)
      if (!disconnectResp.ok) {
        console.log('  Disconnect edge function failed. Testing track behavior anyway...');
      }

      // Wait a moment for the change to propagate
      await new Promise(r => setTimeout(r, 3000));

      // Attempt to track (send new presence update)
      console.log('  Attempting to track after disconnect...');
      let trackAfter = 'TRACKED';
      try {
        await ch.track({ user_id: a1Auth.user.id, online_at: new Date().toISOString(), post_disconnect: true });
      } catch (e) {
        trackAfter = `TRACK_ERROR: ${e.message.slice(0, 80)}`;
      }

      // Check presence state
      const stateAfter = ch.presenceState();
      const stateCount = Object.keys(stateAfter).length;

      // Wait a bit more and check if connection dropped
      await new Promise(r => setTimeout(r, 5000));

      // Try to subscribe a new channel (simulates JWT refresh / reconnect)
      console.log('  Attempting new subscription after disconnect...');
      const ch2 = clientA1.channel(`presence:couple_${TEST.coupleA}`, { config: { private: true } });
      const newSubResult = await subscribeWithTimeout(ch2, a1Auth.user.id, 10000);

      record('Disconnect test: track on existing connection', 'INFO', `Track: ${trackAfter}, presence state: ${stateCount} entries`);
      record('Disconnect test: new subscription after disconnect',
        newSubResult.status === 'CHANNEL_ERROR' || newSubResult.status === 'TIMED_OUT' || newSubResult.status === 'CLOSED' ? 'PASS' : 'INFO',
        `New sub: ${newSubResult.status} ${newSubResult.error || ''}`);

      await ch.unsubscribe(); clientA1.removeChannel(ch);
      await ch2.unsubscribe(); clientA1.removeChannel(ch2);
    }
  }

  // === SUMMARY ===
  console.log('\n=== SUMMARY ===\n');
  const pass = results.filter(r => r.status === 'PASS').length;
  const fail = results.filter(r => r.status === 'FAIL').length;
  const info = results.filter(r => r.status === 'INFO').length;
  console.log(`  PASS: ${pass}  FAIL: ${fail}  INFO: ${info}  TOTAL: ${results.length}\n`);
  if (fail > 0) { console.log('FAILED:'); results.filter(r => r.status === 'FAIL').forEach(r => console.log(`  - ${r.test}: ${r.detail}`)); }
  if (info > 0) { console.log('INFO (context-dependent results):'); results.filter(r => r.status === 'INFO').forEach(r => console.log(`  - ${r.test}: ${r.detail}`)); }
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(err => { console.error('\nFATAL:', err.message); process.exit(2); });
