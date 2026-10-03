// Source-level regressions; live policies/settings still require verification.
// Install @electric-sql/pglite separately and set NODE_PATH to its node_modules.
const { PGlite } = require('@electric-sql/pglite');
const fs = require('node:fs');
const vm = require('node:vm');
const cp = require('node:child_process');
const assert = require('node:assert/strict');
const ts = require('typescript');
const base = '2447a526692fde7db2b1b318c998d92f07c14439';

async function invokeEdge(file, body, original = false, caller = 'a') {
  let handler;
  const copies = [], inserts = [];
  const records = {
    couples: [{ id: 'couple-a', user_a_id: 'a', user_b_id: 'b', active: true }],
    chat_messages: [
      { id: 'chat-a', couple_id: 'couple-a', sender_id: 'a', deleted_at: null, media_storage_bucket: 'chat_media', media_storage_path: 'couple-a/a/photo.jpg', media_type: 'photo', allow_screenshot: false },
      { id: 'chat-b', couple_id: 'couple-b', deleted_at: null, media_storage_path: 'couple-b/c/secret.jpg', media_type: 'photo', allow_screenshot: false },
    ],
    vault_items: [
      { id: 'vault-a', couple_id: 'couple-a', storage_path: 'couple-a/a/photo.jpg', deleted_at: null, allow_screenshot: false },
      { id: 'vault-b', couple_id: 'couple-b', storage_path: 'couple-b/c/secret.jpg', deleted_at: null, allow_screenshot: false },
    ],
    profiles: [], user_settings: [],
  };
  const admin = {
    async rpc(name) { return {data:name==='begin_media_copy'?'lease':null,error:null}; },
    from(table) {
      const filters = [];
      let inserted;
      const query = {
        select() { return query; }, eq(k,v) { filters.push(row => row[k] === v); return query; },
        is(k,v) { filters.push(row => row[k] === v); return query; },
        in(k,vs) { filters.push(row => vs.includes(row[k])); return query; },
        update() { return query; },
        insert(data) { inserted = { id: 'inserted', ...data }; inserts.push({ table, data }); return query; },
        async maybeSingle() { return { data: (records[table] ?? []).find(row => filters.every(fn => fn(row))) ?? null, error: null }; },
        async single() { return { data: inserted, error: null }; },
        then(resolve,reject) { return Promise.resolve({data: inserted ?? null,error:null}).then(resolve,reject); },
      };
      return query;
    },
    storage: { from(bucket) { return { async copy(source, target) { copies.push({bucket,source,target}); return {error:null}; }, async remove() { return {error:null}; } }; } },
  };
  const source = original ? cp.execFileSync('git',['show',`${base}:${file}`],{encoding:'utf8'}) : fs.readFileSync(file,'utf8');
  const stripped = source.replace(/^import .*\n/gm,'');
  const output = ts.transpileModule(stripped,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  const context = { Response, Request, console, exports: {},
    Deno: { env: {get: name => name === 'SUPABASE_ANON_KEY' ? 'anon' : 'service'}, serve: fn => {handler=fn;} },
    createClient: (_url,key) => key === 'anon' ? { auth: { getUser: async () => ({data:{user:{id:caller}},error:null}) } } : admin,
    fetch: async () => new Response('{}',{status:200}),
  };
  vm.runInNewContext(output,context);
  const response = await handler(new Request('https://example.invalid',{method:'POST',headers:{Authorization:'Bearer test','Content-Type':'application/json'},body:JSON.stringify(body)}));
  return {status:response.status,copies,inserts};
}

async function edgeTests() {
  const copyFile='supabase/functions/copy-to-vault/index.ts';
  const body={source_bucket:'chat_media',source_path:'couple-a/a/photo.jpg',vault_path:'couple-a/a/saved.jpg',couple_id:'couple-a',chat_message_id:'chat-a',thumbnail_path:'couple-b/c/secret.jpg'};
  const before=await invokeEdge(copyFile,body,true);
  assert.equal(before.status,200);
  assert.ok(before.copies.some(x=>x.source==='couple-b/c/secret.jpg'),'reproduce unchecked privileged thumbnail copy');
  const after=await invokeEdge(copyFile,body);
  assert.equal(after.status,403); assert.equal(after.copies.length,0);
  const own=await invokeEdge(copyFile,{...body,thumbnail_path:'couple-a/a/photo_thumb.jpg'});
  assert.equal(own.status,200); assert.equal(own.copies.length,2);
  assert.equal((await invokeEdge(copyFile,{...body,source_path:{invalid:true}})).status,400);
  assert.equal((await invokeEdge(copyFile,{...body,thumbnail_path:undefined},false,'outsider')).status,403);
  const screenFile='supabase/functions/notify-screenshot/index.ts';
  for(const key of ['vault_item_id','chat_message_id']) {
    const request={couple_id:'couple-a',detected_by_user_id:'a',[key]:key==='vault_item_id'?'vault-b':'chat-b',source_screen:'chat'};
    const old=await invokeEdge(screenFile,request,true);
    assert.equal(old.status,200);
    assert.ok(old.inserts.some(x=>x.data.metadata?.storage_path==='couple-b/c/secret.jpg'),'reproduce cross-couple metadata disclosure');
    const repaired=await invokeEdge(screenFile,request);
    assert.equal(repaired.status,403); assert.equal(repaired.inserts.length,0);
  }
  assert.equal((await invokeEdge(screenFile,{couple_id:'couple-a',detected_by_user_id:'a',vault_item_id:'vault-a',chat_message_id:'chat-b'})).status,403);
  assert.equal((await invokeEdge(screenFile,{couple_id:'couple-a',detected_by_user_id:'a',vault_item_id:'vault-a'})).status,200);
  console.log('PASS: reproduced both original privileged-function vulnerabilities; cross-couple and malformed requests rejected; own-couple flows preserved');
}

async function databaseTests() {
  const db = new PGlite();
  await db.exec("CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role BYPASSRLS; CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid'; GRANT USAGE ON SCHEMA auth TO authenticated,anon,service_role;");
  const baseline=fs.readFileSync('supabase/migrations/20260722000000_baseline_schema.sql','utf8');
  const fixtureTables = ['couples','profiles','chat_messages','interactions','vault_items','wishes','media_reactions','wish_reactions','activity_events','activity_views','point_events','monthly_scores','scores','cash_in_events','couple_hidden_prompts','user_settings'];
  for(const line of baseline.split('\n')) if(fixtureTables.includes(line.match(/^CREATE TABLE IF NOT EXISTS (\w+)/)?.[1])) await db.exec(line);
  await db.exec('CREATE FUNCTION public.is_current_user_admin() RETURNS boolean LANGUAGE sql AS $$ SELECT false $$; CREATE FUNCTION public.is_super_admin() RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;');
  const protectedTables=['couples','profiles','chat_messages','interactions','vault_items','wishes','media_reactions','wish_reactions','activity_events','activity_views','point_events','monthly_scores','scores','cash_in_events'];
  for(const table of protectedTables) await db.exec(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY; GRANT SELECT,INSERT,UPDATE,DELETE ON ${table} TO authenticated;`);
  // The exported baseline puts USING(true) on INSERT; normalize this invalid
  // dump syntax to its equivalent WITH CHECK policy before testing it.
  for(const match of baseline.matchAll(/CREATE POLICY [\s\S]*?;/g)) {
    const table=match[0].match(/ ON (?:public\.)?(\w+) FOR /)?.[1];
    if(protectedTables.includes(table)) await db.exec(match[0].replace(/FOR INSERT TO (\w+) USING \(true\)/g,'FOR INSERT TO $1'));
  }
  await db.exec('CREATE FUNCTION public.cleanup_orphaned_wish_activity() RETURNS integer LANGUAGE sql SECURITY DEFINER AS $$ SELECT 0 $$;');
  const old=fs.readFileSync('supabase/migrations/20260811162241_20260811120000_wipe_couple_data_on_disconnect.sql.sql','utf8');
  await db.exec(old.slice(old.indexOf('CREATE OR REPLACE FUNCTION'),old.indexOf('$$;',old.indexOf('CREATE OR REPLACE FUNCTION'))+3));
  await db.exec('GRANT EXECUTE ON FUNCTION public.wipe_couple_data(uuid,uuid) TO authenticated;');
  const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222',c='33333333-3333-4333-8333-333333333333',d='44444444-4444-4444-8444-444444444444';
  const one='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',two='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  await db.query('INSERT INTO couples(id,user_a_id,user_b_id) VALUES ($1,$2,$3),($4,$5,$6)',[one,a,b,two,c,d]);
  for(const [id,user] of [[one,a],[two,c]]) {
    await db.query('INSERT INTO chat_messages(couple_id,sender_id,content_text) VALUES ($1,$2,$3)',[id,user,'private']);
    await db.query("INSERT INTO interactions(couple_id,sender_id,receiver_id,type,content_text) VALUES ($1,$2,$3,'dice','private')",[id,user,id===one?b:d]);
    await db.query("INSERT INTO vault_items(couple_id,uploaded_by_user_id,media_type,file_path) VALUES ($1,$2,'photo','private')",[id,user]);
    await db.query("INSERT INTO wishes(couple_id,created_by_user_id,title) VALUES ($1,$2,'private')",[id,user]);
  }
  await db.exec("CREATE SCHEMA storage; CREATE TABLE storage.buckets(id text, public boolean); CREATE TABLE storage.objects(id uuid DEFAULT gen_random_uuid(),bucket_id text,name text); CREATE FUNCTION storage.foldername(text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT string_to_array(regexp_replace($1,'/[^/]+$',''),'/') $$; ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY; GRANT USAGE ON SCHEMA storage TO authenticated,anon,service_role; GRANT ALL ON storage.objects TO authenticated; INSERT INTO storage.buckets VALUES ('chat_media',true),('vault',true);");
  for(const match of baseline.matchAll(/CREATE POLICY [\s\S]*?;/g)) if(match[0].includes('ON storage.objects') && /FOR SELECT/.test(match[0])) await db.exec(match[0]);
  await db.query("INSERT INTO storage.objects(bucket_id,name) VALUES ('vault',$1),('vault',$2)",[`${one}/${a}/own.jpg`,`${two}/${c}/other.jpg`]);
  const migration=fs.readdirSync('supabase/migrations').find(f=>f.endsWith('_harden_privacy_boundaries.sql'));
  await db.exec(fs.readFileSync(`supabase/migrations/${migration}`,'utf8'));
  await db.exec('SET ROLE authenticated');
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[a]);
  assert.equal((await db.query('SELECT * FROM storage.objects')).rows.length,1,'storage lists only own couple media');
  assert.equal((await db.query('DELETE FROM storage.objects WHERE name=$1 RETURNING id',[`${two}/${c}/other.jpg`])).rows.length,0,'foreign media cannot be deleted');
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[b]);
  assert.equal((await db.query('DELETE FROM storage.objects WHERE name=$1 RETURNING id',[`${one}/${a}/own.jpg`])).rows.length,1,'partner can burn shared uploader media');
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[a]);
  const denied=async(sql,args)=>assert.rejects(db.query(sql,args),e=>e.code==='42501');
  for(const table of ['chat_messages','interactions','vault_items','wishes']) {
    assert.equal((await db.query(`SELECT * FROM ${table}`)).rows.length,1,`${table}: reviewer/normal user sees only own couple`);
    assert.equal((await db.query(`DELETE FROM ${table} WHERE couple_id=$1 RETURNING id`,[two])).rows.length,0,`${table}: other couple delete denied`);
  }
  await denied("INSERT INTO chat_messages(couple_id,sender_id) VALUES ($1,$2)",[two,a]);
  await denied("INSERT INTO couples(user_a_id,user_b_id) VALUES ($1,$2)",[a,c]);
  await denied("INSERT INTO activity_events(couple_id,actor_user_id,target_user_id,event_type) VALUES ($1,$2,$3,'send_love')",[one,a,c]);
  await denied('SELECT wipe_couple_data($1,$2)',[two,c]);
  await denied('SELECT cleanup_orphaned_wish_activity()',[]);
  await db.query("INSERT INTO activity_events(couple_id,actor_user_id,target_user_id,event_type) VALUES ($1,$2,$3,'send_love')",[one,a,b]);
  await db.query('UPDATE chat_messages SET deleted_at=now() WHERE couple_id=$1',[one]);
  assert.equal((await db.query('SELECT * FROM chat_messages')).rows.length,1,'audit gap: soft deletion still retains readable own-couple content');
  console.log('CONFIRMED PRE-BURN-MIGRATION GAP: soft-deleted rows remain stored/readable within their couple; verified server purge is required');
  await db.exec('RESET ROLE');
  await db.query('UPDATE couples SET active=false WHERE id=$1',[one]);
  await db.exec('SET ROLE authenticated');
  assert.equal((await db.query('SELECT * FROM chat_messages')).rows.length,0,'inactive couples hidden even if content remains');
  await db.exec('RESET ROLE; GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role; SET ROLE service_role;');
  const result=(await db.query('SELECT wipe_couple_data($1,$2) AS result',[two,c])).rows[0].result;
  assert.equal(result.ok,true,'verified service-role disconnect works with repaired counts');
  assert.equal(result.deleted.chat_messages,1);
  await db.close();
  console.log('PASS: isolated PostgreSQL RLS, both-couple reads/writes, forged pairing/event references, spoofed wipe RPC, inactive couple isolation, service-only disconnect');
}
(async()=>{await edgeTests();await databaseTests();})().catch(e=>{console.error(e);process.exitCode=1;});
