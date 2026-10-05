// Run with NODE_PATH pointing to an installation of @electric-sql/pglite.
// Tests execute the real migration in an isolated Postgres database; no live data.
const { PGlite } = require('@electric-sql/pglite');
const { createClient } = require('@supabase/supabase-js');
const ts = require('typescript');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const path = require('node:path');

async function main() {
  const db = new PGlite();
  const baseline = fs.readFileSync('supabase/migrations/20260722000000_baseline_schema.sql', 'utf8');
  await db.exec("CREATE ROLE authenticated; CREATE ROLE anon; CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT nullif(current_setting(''request.jwt.claim.sub'', true), '''')::uuid';");
  const tables = ['couples', 'interactions', 'chat_messages', 'vault_items', 'wishes', 'activity_events', 'monthly_scores'];
  for (const table of tables) {
    const definition = baseline.split('\n').find(line => line.startsWith(`CREATE TABLE IF NOT EXISTS ${table} (`));
    assert.ok(definition, `baseline defines ${table}`);
    await db.exec(definition);
  }
  const a = '00000000-0000-4000-8000-000000000001';
  const b = '00000000-0000-4000-8000-000000000002';
  const other = '00000000-0000-4000-8000-000000000003';
  const couple = async (paired = true) => (await db.query(
    'INSERT INTO couples(user_a_id, user_b_id) VALUES ($1, $2) RETURNING id', [a, paired ? b : null]
  )).rows[0].id;
  const milestone = async id => {
    const value = (await db.query('SELECT first_moment_completed_at FROM couples WHERE id=$1', [id])).rows[0].first_moment_completed_at;
    return value ? new Date(value).toISOString() : null;
  };
  const historical = await couple();
  await db.query("INSERT INTO chat_messages(couple_id,sender_id,deleted_at,created_at) VALUES ($1,$2,now(),'2026-06-01T00:00:00Z')", [historical,a]);
  const aggregates = await couple();
  await db.query('INSERT INTO monthly_scores(couple_id,user_id,year,month,chat_messages_sent) VALUES ($1,$2,2026,6,10)', [aggregates,a]);
  const untouched = await couple();
  // This pairing predates the First Moment feature but has no retained content
  // evidence. It must still be treated as established, not newly onboarded.
  await db.query("UPDATE couples SET created_at='2026-09-01T00:00:00Z' WHERE id=$1", [untouched]);
  const deletionOnly = await couple();
  await db.query("INSERT INTO activity_events(couple_id,actor_user_id,target_user_id,event_type) VALUES ($1,$2,$3,'content_deleted')", [deletionOnly,a,b]);
  const migration = fs.readdirSync('supabase/migrations').find(f => f.endsWith('_persist_first_moment.sql'));
  await db.exec(fs.readFileSync(path.join('supabase/migrations', migration), 'utf8'));
  assert.equal(new Date(await milestone(historical)).toISOString(), '2026-06-01T00:00:00.000Z');
  assert.ok(await milestone(aggregates), 'retained aggregates restore burned history');
  assert.equal(await milestone(untouched), null, 'original evidence migration does not guess from pair age');
  assert.equal(await milestone(deletionOnly), null, 'deletion alone is not proof of a moment');
  const grandfather = fs.readdirSync('supabase/migrations').find(f => f.endsWith('_grandfather_legacy_first_moment.sql'));
  await db.exec(fs.readFileSync(path.join('supabase/migrations', grandfather), 'utf8'));
  assert.equal(new Date(await milestone(untouched)).toISOString(), '2026-09-01T00:00:00.000Z', 'pre-feature established pair is grandfathered');

  const inserts = {
    interactions: "INSERT INTO interactions(couple_id,sender_id,receiver_id,type) VALUES ($1,$2,$3,'dice')",
    chat_messages: 'INSERT INTO chat_messages(couple_id,sender_id) VALUES ($1,$2)',
    vault_items: "INSERT INTO vault_items(couple_id,uploaded_by_user_id,media_type,file_path) VALUES ($1,$2,'photo','test')",
    wishes: "INSERT INTO wishes(couple_id,created_by_user_id,title) VALUES ($1,$2,'test')",
    activity_events: "INSERT INTO activity_events(couple_id,actor_user_id,target_user_id,event_type) VALUES ($1,$2,$3,'send_love')",
  };
  for (const [table, sql] of Object.entries(inserts)) {
    const id = await couple();
    const params = sql.includes('$3') ? [id,a,b] : [id,a];
    await db.query(sql, params);
    const first = await milestone(id);
    assert.ok(first, `${table} completes the milestone`);
    await db.query(`DELETE FROM ${table} WHERE couple_id=$1`, [id]);
    assert.equal(await milestone(id), first, `${table} burn preserves the milestone`);
    await db.query('UPDATE couples SET first_moment_completed_at=NULL WHERE id=$1', [id]);
    assert.equal(await milestone(id), first, 'direct update cannot clear it');
    await db.query(sql, params);
    assert.equal(await milestone(id), first, 'later moments preserve the timestamp');
    await db.query('UPDATE couples SET active=false,user_b_id=NULL,disconnected_at=now() WHERE id=$1', [id]);
    assert.equal(await milestone(id), null, 'disconnect clears the pairing milestone');
  }
  const solo = await couple(false);
  await db.query(inserts.chat_messages, [solo,a]);
  assert.equal(await milestone(solo), null, 'solo content does not complete a couple milestone');
  await db.query('UPDATE couples SET first_moment_completed_at=now() WHERE id=$1', [untouched]);
  assert.equal(await milestone(untouched), null, 'clients cannot invent the milestone');
  await db.query('BEGIN');
  await db.query(inserts.chat_messages, [untouched,a]);
  await db.query('ROLLBACK');
  assert.equal(await milestone(untouched), null, 'failed/rolled-back send does not complete it');
  await db.query(inserts.chat_messages, [untouched,a]);
  await db.query('UPDATE couples SET user_b_id=$2 WHERE id=$1', [untouched,other]);
  assert.equal(await milestone(untouched), null, 'new partner starts fresh');
  const exposed = (await db.query("SELECT has_function_privilege('authenticated', 'public.record_first_moment()', 'execute') AS allowed")).rows[0];
  assert.equal(exposed.allowed, false, 'trigger function cannot be called by clients');
  const unauthorized = await couple();
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [other]);
  await db.query(inserts.activity_events, [unauthorized,other,b]);
  assert.equal(await milestone(unauthorized), null, 'an unrelated event actor cannot change a couple milestone');
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [b]);
  await db.query(inserts.chat_messages, [unauthorized,b]);
  assert.ok(await milestone(unauthorized), 'either partner can complete the milestone');
  await db.close();
  console.log('PASS: historical backfill, all five send paths, burns, immutability, disconnect, solo, rollback, partner change, function permissions');

  const output = ts.transpileModule(fs.readFileSync('lib/realtimeTopic.ts','utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS }}).outputText;
  const helper = { exports: {} };
  new Function('module', 'exports', output)(helper, helper.exports);
  const client = createClient('https://example.supabase.co', 'test-key', { auth: { persistSession: false }, realtime: { transport: class MockSocket { constructor() { this.readyState = 0; } close() {} send() {} } } });
  const filter = { event: '*', schema: 'public', table: 'media_reactions' };
  const old = client.channel('fixed-topic').on('postgres_changes',filter,()=>{}).subscribe();
  assert.throws(() => client.channel('fixed-topic').on('postgres_changes',filter,()=>{}), /after.*subscribe/);
  const topics = new Set();
  for (let i=0; i<100; i++) {
    const topic = helper.exports.uniqueRealtimeTopic('media_reactions_couple_chat_messages');
    assert.ok(!topics.has(topic), 'overlapping/repeated mounts get unique topics');
    topics.add(topic);
    const channel = client.channel(topic).on('postgres_changes',filter,()=>{}).subscribe();
    assert.notEqual(channel, old);
    await client.removeChannel(channel);
  }
  await client.removeAllChannels();
  console.log('PASS: reproduced original Supabase exception; 100 fresh subscriptions register and clean up without collision');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
