#!/usr/bin/env node
/**
 * Live Privacy Verification — Phase 1 + Phase 2
 *
 * Tests cross-couple access using authenticated sessions (anon key only).
 * Covers: chat_messages, activity_events, wishes, interactions,
 * couple_hidden_prompts, couples, profiles, vault_items, custom prompts
 * (dice/dare/tell_me), storage (all 3 buckets), notify-partner edge
 * function, grant_entitlement RPC, admin/super-admin denial.
 *
 * Prerequisites:
 *   1. Create test users:   node scripts/test-live-setup.cjs
 *   2. Set up test data:     Run the SQL output from test-live-setup.cjs
 *   3. (Optional) Toggle admin flag on A1 for admin tests
 *   4. Run this script with the printed args from step 1
 *
 * Usage:
 *   node scripts/test-live-privacy-verification.cjs \
 *     <a1-email> <b1-email> <coupleA-id> <coupleB-id> \
 *     <a1-user-id> <b1-user-id> <a2-user-id> <b2-user-id>
 *
 * Credentials are read from .env (EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY).
 * Test account password is passed via TEST_PASSWORD env var or defaults to a throwaway.
 */
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'TestPass123!';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY in .env');
  process.exit(2);
}

const TEST = {
  coupleA: '',
  coupleB: '',
  userA1: { id: '', email: '' },
  userA2: { id: '' },
  userB1: { id: '', email: '' },
  userB2: { id: '' },
};

const args = process.argv.slice(2);
if (args.length >= 8) {
  TEST.userA1.email = args[0];
  TEST.userB1.email = args[1];
  TEST.coupleA = args[2];
  TEST.coupleB = args[3];
  TEST.userA1.id = args[4];
  TEST.userB1.id = args[5];
  TEST.userA2.id = args[6];
  TEST.userB2.id = args[7];
} else {
  console.error('Usage: node script.js <a1-email> <b1-email> <coupleA-id> <coupleB-id> <a1-id> <b1-id> <a2-id> <b2-id>');
  process.exit(2);
}

const results = [];
function record(test, status, detail) {
  results.push({ test, status, detail });
  console.log(`  [${status}] ${test}: ${detail}`);
}

function makeClient() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
}

async function signIn(email) {
  const client = makeClient();
  const { data, error } = await client.auth.signInWithPassword({ email, password: TEST_PASSWORD });
  if (error) throw new Error(`Auth failed for ${email}: ${error.message}`);
  return { client, session: data.session, user: data.user };
}

async function main() {
  console.log('=== Live Privacy Verification ===\n');
  console.log('--- Authenticating ---');

  const { client: clientA1, user: userA1 } = await signIn(TEST.userA1.email);
  console.log(`  A1: ${userA1.id}`);
  const { client: clientB1, user: userB1 } = await signIn(TEST.userB1.email);
  console.log(`  B1: ${userB1.id}`);

  const rawClient = makeClient();

  // === DATABASE TABLES ===
  console.log('\n--- Chat Messages ---');
  {
    const { data, error } = await clientA1.from('chat_messages').select('*').eq('couple_id', TEST.coupleA);
    record('A1 reads own chat', (!error && (data?.length ?? 0) > 0) ? 'PASS' : 'INFO', error ? error.message : `${data?.length} rows`);
  }
  {
    const { data, error } = await clientA1.from('chat_messages').select('*').eq('couple_id', TEST.coupleB);
    record('A1 reads foreign chat', (!error && (data?.length ?? 0) === 0) ? 'PASS' : 'FAIL', error ? error.message : `${data?.length} rows (expect 0)`);
  }
  {
    const { error } = await clientA1.from('chat_messages').insert({ couple_id: TEST.coupleB, sender_id: TEST.userA1.id, content_text: 'x' });
    record('A1 inserts foreign chat', error ? 'PASS' : 'FAIL', error ? `rejected: ${error.message.slice(0, 80)}` : 'BREACH');
  }
  {
    const { data, error } = await clientA1.from('chat_messages').update({ content_text: 't' }).eq('couple_id', TEST.coupleB).select();
    record('A1 updates foreign chat', (!error && (data?.length ?? 0) === 0) ? 'PASS' : 'FAIL', error ? error.message : `${data?.length} rows affected (expect 0)`);
  }
  {
    const { data, error } = await clientA1.from('chat_messages').delete().eq('couple_id', TEST.coupleB).select();
    record('A1 deletes foreign chat', (!error && (data?.length ?? 0) === 0) ? 'PASS' : 'FAIL', error ? error.message : `${data?.length} rows deleted (expect 0)`);
  }

  console.log('\n--- Activity Events ---');
  {
    const { data, error } = await clientA1.from('activity_events').select('*').eq('couple_id', TEST.coupleB);
    record('A1 reads foreign activity', (!error && (data?.length ?? 0) === 0) ? 'PASS' : 'FAIL', error ? error.message : `${data?.length} rows (expect 0)`);
  }

  console.log('\n--- Wishes ---');
  {
    const { data, error } = await clientA1.from('wishes').select('*').eq('couple_id', TEST.coupleB);
    record('A1 reads foreign wishes', (!error && (data?.length ?? 0) === 0) ? 'PASS' : 'FAIL', error ? error.message : `${data?.length} rows (expect 0)`);
  }

  console.log('\n--- Interactions ---');
  {
    const { data, error } = await clientA1.from('interactions').select('*').eq('couple_id', TEST.coupleB);
    record('A1 reads foreign interactions', (!error && (data?.length ?? 0) === 0) ? 'PASS' : 'FAIL', error ? error.message : `${data?.length} rows (expect 0)`);
  }

  console.log('\n--- Hidden Prompts ---');
  {
    const { data, error } = await clientA1.from('couple_hidden_prompts').select('*').eq('couple_id', TEST.coupleB);
    record('A1 reads foreign hidden_prompts', (!error && (data?.length ?? 0) === 0) ? 'PASS' : 'FAIL', error ? error.message : `${data?.length} rows (expect 0)`);
  }

  console.log('\n--- Couples Table ---');
  {
    const { data, error } = await clientA1.from('couples').select('*').eq('id', TEST.coupleB);
    record('A1 reads foreign couple', (!error && (data?.length ?? 0) === 0) ? 'PASS' : 'FAIL', error ? error.message : `${data?.length} rows (expect 0)`);
  }
  {
    const { data, error } = await clientA1.from('couples').update({ active: false }).eq('id', TEST.coupleB).select();
    record('A1 updates foreign couple', (!error && (data?.length ?? 0) === 0) ? 'PASS' : 'FAIL', error ? error.message : `${data?.length} rows (expect 0)`);
  }

  console.log('\n--- Profiles ---');
  {
    const { data, error } = await clientA1.from('profiles').select('id, display_name').eq('id', TEST.userA2.id);
    record('A1 reads partner profile', (!error && (data?.length ?? 0) === 1) ? 'PASS' : 'INFO', error ? error.message : `${data?.length} rows`);
  }
  {
    const { data, error } = await clientA1.from('profiles').select('id, display_name').eq('id', TEST.userB1.id);
    record('A1 reads foreign profile', (!error && (data?.length ?? 0) === 0) ? 'PASS' : 'FAIL', error ? error.message : `${data?.length} rows (expect 0)`);
  }

  console.log('\n--- Vault Items ---');
  {
    const { data, error } = await clientA1.from('vault_items').select('*').eq('couple_id', TEST.coupleB);
    record('A1 reads foreign vault_items', (!error && (data?.length ?? 0) === 0) ? 'PASS' : 'FAIL', error ? error.message : `${data?.length} rows (expect 0)`);
  }

  console.log('\n--- Custom Prompts (dice/dare/tell_me) ---');
  for (const table of ['dice_prompts', 'dare_prompts', 'tell_me_prompts']) {
    {
      const { data, error } = await clientA1.from(table).select('*').eq('couple_id', TEST.coupleB).eq('is_default', false);
      record(`A1 reads foreign custom ${table}`, (!error && (data?.length ?? 0) === 0) ? 'PASS' : 'FAIL', error ? error.message : `${data?.length} rows (expect 0)`);
    }
    {
      const { data, error } = await clientA1.from(table).select('*').eq('is_default', true).limit(1);
      record(`A1 reads default ${table}`, !error ? 'PASS-EXPECTED' : 'INFO', error ? error.message : `${data?.length} default rows`);
    }
  }

  // === STORAGE ===
  console.log('\n--- Storage Buckets ---');
  const ts = Date.now();
  const minJpeg = Buffer.from([
    0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
    0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43,
    0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
    0x09, 0x08, 0x0A, 0x0C, 0x14, 0x0D, 0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12,
    0x13, 0x0F, 0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D, 0x1A, 0x1C, 0x1C, 0x20,
    0x24, 0x2E, 0x27, 0x20, 0x22, 0x2C, 0x23, 0x1C, 0x1C, 0x28, 0x37, 0x29,
    0x2C, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1F, 0x27, 0x39, 0x3D, 0x38, 0x32,
    0x3C, 0x2E, 0x33, 0x34, 0x32, 0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x01,
    0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xFF, 0xC4, 0x00, 0x1F, 0x00, 0x00,
    0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
    0x09, 0x0A, 0x0B, 0xFF, 0xC4, 0x00, 0xB5, 0x10, 0x00, 0x02, 0x01, 0x03,
    0x03, 0x02, 0x04, 0x02, 0x05, 0x07, 0x06, 0x08, 0x05, 0x03, 0x0C, 0x33,
    0x01, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x11, 0x00, 0x04, 0x05, 0x21,
    0x31, 0x06, 0x12, 0x41, 0x51, 0x07, 0x61, 0x81, 0xA1, 0xB1, 0xC1, 0xD1,
    0xE1, 0xF1, 0x13, 0x22, 0x32, 0x42, 0x71, 0x91, 0xA2, 0xB2, 0xC2, 0xD2,
    0xE2, 0xF2, 0x14, 0x23, 0x33, 0x52, 0x62, 0x72, 0x82, 0x92, 0xB3, 0xC3,
    0xD3, 0xE3, 0xF3, 0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3F,
    0x00, 0x7B, 0x40, 0x1B, 0xFF, 0xD9
  ]);
  const fileBlob = new Blob([minJpeg], { type: 'image/jpeg' });

  for (const bucket of ['avatars', 'chat_media', 'vault']) {
    const ownPathA = bucket === 'avatars'
      ? `${TEST.userA1.id}/test-${ts}.jpg`
      : `${TEST.coupleA}/${TEST.userA1.id}/test-${ts}.jpg`;
    const ownPathB = bucket === 'avatars'
      ? `${TEST.userB1.id}/test-${ts}.jpg`
      : `${TEST.coupleB}/${TEST.userB1.id}/test-${ts}.jpg`;

    // A1 uploads own file
    { const { error } = await clientA1.storage.from(bucket).upload(ownPathA, fileBlob, { contentType: 'image/jpeg' });
      record(`A1 uploads own ${bucket}`, !error ? 'PASS' : 'FAIL', error ? error.message.slice(0, 80) : 'ok'); }

    // A1 downloads own file
    { const { error } = await clientA1.storage.from(bucket).download(ownPathA);
      record(`A1 downloads own ${bucket}`, !error ? 'PASS' : 'FAIL', error ? error.message.slice(0, 80) : 'ok'); }

    // B1 uploads own file
    { const { error } = await clientB1.storage.from(bucket).upload(ownPathB, fileBlob, { contentType: 'image/jpeg' });
      record(`B1 uploads own ${bucket}`, !error ? 'PASS' : 'FAIL', error ? error.message.slice(0, 80) : 'ok'); }

    // A1 tries to download B's file
    { const { error } = await clientA1.storage.from(bucket).download(ownPathB);
      record(`A1 downloads foreign ${bucket}`, error ? 'PASS' : 'FAIL', error ? `rejected: ${error.message.slice(0, 80)}` : 'BREACH'); }

    // A1 tries to create signed URL for B's file
    { const { data, error } = await clientA1.storage.from(bucket).createSignedUrl(ownPathB, 60);
      if (error) { record(`A1 signed URL foreign ${bucket}`, 'PASS', `rejected: ${error.message.slice(0, 80)}`); }
      else if (data?.signedUrl) { try { const r = await fetch(data.signedUrl); record(`A1 signed URL foreign ${bucket}`, r.ok ? 'FAIL' : 'PASS', r.ok ? 'BREACH' : `HTTP ${r.status}`); } catch (e) { record(`A1 signed URL foreign ${bucket}`, 'PASS', `failed: ${e.message.slice(0, 80)}`); } }
      else { record(`A1 signed URL foreign ${bucket}`, 'PASS', 'no URL'); } }

    // Unauthenticated download
    { const { error } = await rawClient.storage.from(bucket).download(ownPathA);
      record(`Unauth download ${bucket}`, error ? 'PASS' : 'FAIL', error ? `rejected: ${error.message.slice(0, 80)}` : 'BREACH'); }

    // Unauthenticated signed URL
    { const { data, error } = await rawClient.storage.from(bucket).createSignedUrl(ownPathA, 60);
      if (error) { record(`Unauth signed URL ${bucket}`, 'PASS', `rejected: ${error.message.slice(0, 80)}`); }
      else if (data?.signedUrl) { try { const r = await fetch(data.signedUrl); record(`Unauth signed URL ${bucket}`, r.ok ? 'FAIL' : 'PASS', r.ok ? 'BREACH' : `HTTP ${r.status}`); } catch (e) { record(`Unauth signed URL ${bucket}`, 'PASS', `failed: ${e.message.slice(0, 80)}`); } }
      else { record(`Unauth signed URL ${bucket}`, 'PASS', 'no URL'); } }
  }

  // === NOTIFY-PARTNER EDGE FUNCTION ===
  console.log('\n--- notify-partner Edge Function ---');
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${(await signIn(TEST.userA1.email)).session.access_token}`, Apikey: SUPABASE_ANON_KEY };

  for (const [label, event_type, couple_id, item_id] of [
    ['foreign item_id', 'new_vault_item', TEST.coupleA, '00000000-0000-0000-0000-000000000000'],
    ['foreign couple_id', 'new_message', TEST.coupleB, undefined],
    ['own couple (normal)', 'new_message', TEST.coupleA, undefined],
    ['foreign couple + always-show', 'partner_joined', TEST.coupleB, undefined],
    ['own couple + non-existent item', 'new_vault_item', TEST.coupleA, '11111111-1111-1111-1111-111111111111'],
  ]) {
    const body = { event_type, couple_id };
    if (item_id) body.item_id = item_id;
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/notify-partner`, { method: 'POST', headers, body: JSON.stringify(body) });
    const json = await resp.json().catch(() => ({}));
    const expect = label.includes('foreign') ? 403 : label.includes('non-existent') ? 403 : 200;
    record(`notify-partner: ${label}`, resp.status === expect ? 'PASS' : 'FAIL', `HTTP ${resp.status}: ${json.error ?? JSON.stringify(json).slice(0, 80)}`);
  }

  // Unauthenticated
  { const resp = await fetch(`${SUPABASE_URL}/functions/v1/notify-partner`, { method: 'POST', headers: { 'Content-Type': 'application/json', Apikey: SUPABASE_ANON_KEY }, body: JSON.stringify({ event_type: 'new_message', couple_id: TEST.coupleA }) });
    const json = await resp.json().catch(() => ({}));
    record('notify-partner: unauthenticated', resp.status === 401 ? 'PASS' : 'FAIL', `HTTP ${resp.status}: ${json.error ?? JSON.stringify(json).slice(0, 80)}`); }

  // === GRANT_ENTITLEMENT ===
  console.log('\n--- grant_entitlement RPC ---');
  { const { error } = await clientA1.rpc('grant_entitlement', { target_user_id: TEST.userA2.id, entitlement: 'premium' });
    record('A1 calls grant_entitlement', error ? 'PASS' : 'FAIL', error ? `rejected: ${error.message.slice(0, 80)}` : 'BREACH'); }
  { const { error } = await rawClient.rpc('grant_entitlement', { target_user_id: TEST.userA1.id, entitlement: 'premium' });
    record('Unauth calls grant_entitlement', error ? 'PASS' : 'FAIL', error ? `rejected: ${error.message.slice(0, 80)}` : 'BREACH'); }

  // === ADMIN AGGREGATE STATS ===
  console.log('\n--- Admin Aggregate Stats ---');
  { const { data, error } = await clientA1.rpc('admin_chat_stats', {});
    record('A1 calls admin_chat_stats', !error ? 'PASS-EXPECTED' : 'INFO', error ? error.message : `${data?.length} rows`); }
  { const { data, error } = await clientB1.rpc('admin_chat_stats', {});
    record('B1 (non-admin) calls admin_chat_stats', error ? 'PASS' : 'FAIL', error ? `rejected: ${error.message.slice(0, 80)}` : 'BREACH'); }

  // === SUMMARY ===
  console.log('\n=== SUMMARY ===\n');
  const pass = results.filter(r => r.status === 'PASS').length;
  const expected = results.filter(r => r.status === 'PASS-EXPECTED').length;
  const fail = results.filter(r => r.status === 'FAIL').length;
  const info = results.filter(r => r.status === 'INFO').length;
  console.log(`  PASS: ${pass}  PASS-EXPECTED: ${expected}  FAIL: ${fail}  INFO: ${info}  TOTAL: ${results.length}\n`);
  if (fail > 0) { console.log('FAILED:'); results.filter(r => r.status === 'FAIL').forEach(r => console.log(`  - ${r.test}: ${r.detail}`)); console.log(''); }
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(err => { console.error('\nFATAL:', err.message); process.exit(2); });
