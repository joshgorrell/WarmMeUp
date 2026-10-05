// Executes current TypeScript handlers with controlled auth/network responses.
// No real users, purchases, email or production database are touched.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const { PGlite } = require('@electric-sql/pglite');
function moduleFrom(file, mocks={}) {
  const source = ts.transpileModule(fs.readFileSync(file,'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop:true } }).outputText;
  const module = { exports: {} };
  new Function('require','module','exports','React', source)(name => {
    if (name in mocks) return mocks[name];
    throw Error(`Missing mock: ${name}`);
  },module,module.exports,mocks.react);
  return module.exports;
}
const profile = {first_name:'Test',last_name:'Partner',date_of_birth:'1990-01-01',age_verified_at:'2026-01-01',tos_accepted_at:'2026-01-01'};
const registration = moduleFrom('lib/registration.ts');
assert.equal(registration.registrationComplete(profile),true);
for (const p of [null, {...profile, first_name:' '}, {...profile,last_name:''}, {...profile,date_of_birth:'2015-01-01'}, {...profile,date_of_birth:'2000-02-31'}, {...profile,age_verified_at:null}, {...profile,tos_accepted_at:null}]) assert.equal(registration.registrationComplete(p),false);
const redirect = moduleFrom('lib/authRedirect.ts', {'react-native':{Platform:{OS:'ios'}}});
assert.equal(redirect.authRedirectUrl(true),'warmup://auth/callback?recovery=1');
assert.equal(redirect.parseAuthCallback('warmup://auth/callback?recovery=1#access_token=test&refresh_token=test').recovery,true);
assert.equal(redirect.parseAuthCallback('warmup://auth/callback?code=pkce').code,'pkce');

function harness() {
  const effects=[],states=[],routes=[];
  const react={useEffect:f=>effects.push(f),useRef:value=>({current:value}),useState:value=>[value,next=>states.push(next)],useCallback:f=>f,
    createElement:(type,props,...children)=>({type,props:props||{},children})};
  return {effects,states,routes,react};
}
async function testOnboarding(options={}) {
  const h=harness();let saved=0, joins=0, cleared=0;
  const user={id:'test-user'};
  const auth={user,couple:null,refreshProfile:async()=>{},refreshSettings:async()=>{},refreshCouple:async()=>{}};
  const db={from:table=>{
    const query={ select:()=>query,eq:()=>query,or:()=>query,not:()=>query,limit:()=>query,
      update:()=>{saved++;query.writing=true;return query;},
      single:async()=>options.zeroWrite&&query.writing ? {data:null,error:Error('zero rows')} : {data:table==='profiles'&&!query.writing?profile:{id:user.id,user_id:user.id},error:null},
      maybeSingle:async()=>({data:options.paired?{id:'pair',user_b_id:'partner'}:null,error:null})};return query;}};
  const mocks={'react':h.react,'react-native':{View:'View',StyleSheet:{create:x=>x}},'expo-router':{useRouter:()=>({replace:x=>h.routes.push(x)}),useLocalSearchParams:()=>({pendingCode:options.code})},
    '@/lib/registration':{registrationComplete:registration.registrationComplete},'@/context/AuthContext':{useAuth:()=>auth},'@/lib/supabase':{supabase:db},
    '@/lib/inviteCode':{loadPendingCode:async()=>options.code||null,savePendingCode:async()=>{},clearPendingCode:async()=>cleared++},
    '@/lib/coupleJoin':{completePendingJoin:async()=>{joins++;return options.joinFails?{ok:false,reason:'error'}:{ok:true,inviterName:'Partner'};},isDefinitiveJoinFailure:()=>false},
    '@/lib/notifications':{registerForPushNotifications:async()=>null,savePushToken:async()=>{}},
    '@/components/OnboardingCarousel':{default:'Carousel'},'@/components/AppText':{default:'Text'},'@/components/PrimaryButton':{default:'Button'}};
  const tree=moduleFrom('app/(auth)/onboarding.tsx',mocks).default();
  await tree.props.onComplete('invite-partner');
  if(options.zeroWrite) {assert.equal(h.routes.length,0);assert.ok(h.states.includes(true));}
  else if(options.paired) {assert.equal(h.routes.at(-1),'/transition');assert.equal(joins,0);}
  else if(options.code&&!options.joinFails) {assert.equal(h.routes.at(-1).pathname,'/(auth)/paired-celebration');assert.equal(cleared,1);}
  else if(options.code) {assert.equal(h.routes.at(-1).params.prefilledCode,options.code);assert.equal(cleared,0);}
  else assert.equal(h.routes.at(-1),'/(auth)/pair');
  assert.ok(saved>0);
}
async function testCallback(recovery=false, warm=false) {
  const h=harness();const calls=[];const session={user:{id:'test-user',email_confirmed_at:'2026-01-01'}};
  const auth={setSession:async()=>{calls.push('setSession');return {error:null};},getSession:async()=>({data:{session},error:null}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})};
  const refresh={refreshProfile:async()=>{},refreshCouple:async()=>{},refreshSubscription:async()=>{}};
  const mocks={'react':h.react,'react-native':{View:'View',ActivityIndicator:'Spinner',Platform:{OS:'ios'},StyleSheet:{create:x=>x}},
    'expo-linking':{getLinkingURL:()=>warm?`warmup://auth/callback${recovery?'?recovery=1':''}#access_token=test&refresh_token=test`:null,getInitialURL:async()=>warm?'warmup://':`warmup://auth/callback${recovery?'?recovery=1':''}#access_token=test&refresh_token=test`,addEventListener:()=>({remove(){}})},
    'expo-router':{useRouter:()=>({replace:x=>h.routes.push(x)})},'@/lib/supabase':{supabase:{auth,from:()=>({select(){return this;},eq(){return this;},single:async()=>({data:{...profile,onboarding_completed_at:'2026-01-01'},error:null})})}},
    '@/context/AuthContext':{useAuth:()=>refresh},'@/lib/authRedirect':redirect,'@/lib/registration':registration,
    '@/lib/inviteCode':{loadPendingCode:async()=>null},'@/lib/coupleJoin':{},'@/components/AppText':{default:'Text'},'@/components/PrimaryButton':{default:'Button'}};
  moduleFrom('app/auth/callback.tsx',mocks).default();
  const cleanup=h.effects[0]();
  await new Promise(resolve=>setTimeout(resolve,20));
  cleanup();assert.deepEqual(calls,['setSession']);assert.equal(h.routes.at(-1),recovery?'/(auth)/reset-password':'/transition');
}
async function testRegistrationReturn(paired, lookupFails=false) {
  // Execute the actual avatar completion callback, including compliance checks.
  const source=fs.readFileSync('app/(auth)/register.tsx','utf8');
  const start=source.indexOf('const proceedFromAvatarStep = useCallback(async () => {');
  const end=source.indexOf('}, [createdUserId, pendingCode, email, router, refreshProfile]);',start);
  assert.ok(start>=0 && end>start);
  const body=source.slice(start,end)+'});';
  const routes=[],errors=[];let joins=0;
  const query={select(){return this;},eq(){return this;},not(){return this;},or(){return this;},limit(){return this;},
    single:async()=>({data:profile,error:null}),maybeSingle:async()=>({data:paired?{id:'existing-pair'}:null,error:lookupFails?Error('network'):null})};
  const supabase={auth:{getUser:async()=>({data:{user:{id:'test-user',email_confirmed_at:'2026-01-01'}},error:null})},from:()=>query};
  const run=new Function('useCallback','createdUserId','proceedingRef','setApiError','supabase','pendingCode','loadPendingCode','router','email','refreshProfile','isRegistrationComplete','setStep','completePendingJoin','clearPendingCode','isDefinitiveJoinFailure',body+'return proceedFromAvatarStep;');
  const callback=run(f=>f,'test-user',{current:false},x=>errors.push(x),supabase,'INVITE',async()=>null,{replace:x=>routes.push(x)},'test@example.com',async()=>{},registration.registrationComplete,()=>{},async()=>{joins++;return {ok:false,reason:'error'};},async()=>{},()=>false);
  await callback();
  if(lookupFails){assert.equal(routes.length,0);assert.ok(errors.at(-1));assert.equal(joins,0);}
  else if(paired){assert.equal(routes.at(-1),'/transition');assert.equal(joins,0);}
  else {assert.equal(routes.at(-1).pathname,'/(auth)/onboarding');assert.equal(joins,1);assert.equal(routes.at(-1).params.pendingCode,'INVITE');}
}
async function subscriptionTests() {
  const source=fs.readFileSync('context/AuthContext.tsx','utf8');
  const fn=source.slice(source.indexOf('async function fetchEffectiveSubscription'),source.indexOf('export function AuthProvider'));
  const js=ts.transpileModule(fn+'\nmodule.exports=fetchEffectiveSubscription;', {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  for (const response of [{ok:false,text:async()=> 'outage'}, {ok:true,text:async()=> '{invalid'}, {ok:true,text:async()=> '{}'}, {ok:true,text:async()=> JSON.stringify({isPremium:false,canInvite:false})}, {ok:true,text:async()=>JSON.stringify({isPremium:true,canInvite:true})}]) {
    const module={exports:{}};
    new Function('module','fetch','DEFAULT_SUBSCRIPTION_INFO','logger','process',js)(module,async()=>response,{isPremium:false,canInvite:false,loading:true},{log(){}},{env:{EXPO_PUBLIC_SUPABASE_URL:'https://example.supabase.co'}});
    const result=await module.exports('test');
    if(response.ok && (await response.text()).includes('isPremium')) assert.equal(result.loading,false);
    else assert.equal(result.loading,true,'outage/malformed data stays unresolved');
  }
}
async function notificationTests() {
  let prompts=0;const writes=[];
  const api=moduleFrom('lib/notifications.ts',{'react-native':{Platform:{OS:'ios'}},'expo-notifications':{getPermissionsAsync:async()=>({status:'undetermined'}),requestPermissionsAsync:async()=>{prompts++;return {status:'denied'};}},'./debugLog':{logDebugEvent(){}},'./supabase':{supabase:{from:table=>({update:patch=>({eq:async()=>{writes.push({table,patch});}})})}}});
  assert.equal(await api.registerForPushNotifications(false),null);assert.equal(prompts,0);
  await api.registerForPushNotifications();assert.equal(prompts,1);
  await api.savePushToken('test','test-token',false);await api.clearPushToken('test',false);
  assert.equal(writes.length,2);assert.ok(writes.every(write=>write.table==='profiles'),'boot/logout preserves notification preference');
}
async function databaseTests() {
  const db=new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
    CREATE TABLE auth.users(id uuid PRIMARY KEY,email_confirmed_at timestamptz);
    CREATE TABLE profiles(id uuid PRIMARY KEY,first_name text,last_name text,avatar_url text,date_of_birth date,age_verified_at timestamptz,tos_accepted_at timestamptz,onboarding_completed_at timestamptz);
    CREATE TABLE couples(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_a_id uuid,user_b_id uuid,active boolean DEFAULT true,invite_code text,invite_code_used_at timestamptz,pending_partner_id uuid,pending_partner_status text,pending_requested_at timestamptz,subscription_owner_id uuid);
    CREATE TABLE content_burn_jobs(couple_id uuid,state text);
    CREATE TABLE invite_join_attempts(user_id uuid PRIMARY KEY,attempt_count int,window_start timestamptz);
    CREATE TABLE subscriptions(id uuid DEFAULT gen_random_uuid(),user_id uuid,plan text,status text);
    CREATE TABLE scores(couple_id uuid,user_id uuid,points int,UNIQUE(couple_id,user_id));
    CREATE TABLE user_settings(user_id uuid,celebration_seen boolean);
  `);
  const ids=Array.from({length:5},(_,i)=>`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`);
  for(const id of ids) {
    await db.query('INSERT INTO auth.users VALUES($1,now())',[id]);
    await db.query("INSERT INTO profiles VALUES($1,'Test','Partner',null,'1990-01-01',now(),now(),null)",[id]);
    await db.query('INSERT INTO user_settings VALUES($1,true)',[id]);
  }
  const [a,b,c,d,e]=ids;
  const file=fs.readdirSync('supabase/migrations').find(x=>x.endsWith('_harden_onboarding_pairing.sql'));
  await db.exec(fs.readFileSync(`supabase/migrations/${file}`,'utf8'));
  await assert.rejects(db.query("UPDATE profiles SET date_of_birth='2015-01-01',age_verified_at=now() WHERE id=$1",[b]),/18 or older/);
  await assert.rejects(db.query("UPDATE profiles SET first_name=' ',onboarding_completed_at=now() WHERE id=$1",[b]),/registration_incomplete/);
  await db.query("INSERT INTO couples(user_a_id,invite_code) VALUES($1,'ABCDEF')",[a]);
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[b]);
  let joined=(await db.query("SELECT request_join('ABCDEF') AS result")).rows[0].result;
  assert.equal(joined.ok,true);
  assert.equal((await db.query('SELECT invite_code FROM couples WHERE id=$1',[joined.couple_id])).rows[0].invite_code,null);
  assert.equal((await db.query('SELECT celebration_seen FROM user_settings WHERE user_id=$1',[b])).rows[0].celebration_seen,false);
  await assert.rejects(db.query('INSERT INTO couples(user_a_id,user_b_id) VALUES($1,$2)',[c,b]),/already_connected/);
  await assert.rejects(db.query('INSERT INTO couples(user_a_id,user_b_id) VALUES($1,$2)',[b,c]),/already_connected/);
  await assert.rejects(db.query('INSERT INTO couples(user_a_id,user_b_id) VALUES($1,$1)',[c]),/self_pairing/);
  await db.query("INSERT INTO couples(user_a_id,invite_code,active) VALUES($1,'STALED',false)",[c]);
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[d]);
  assert.equal((await db.query("SELECT request_join('STALED') AS result")).rows[0].result.reason,'not_found');
  await db.query("INSERT INTO couples(user_a_id,invite_code) VALUES($1,'FRESHX')",[c]);
  await db.query('UPDATE auth.users SET email_confirmed_at=null WHERE id=$1',[d]);
  await assert.rejects(db.query("SELECT request_join('FRESHX')"),/registration_incomplete/);
  await db.query('UPDATE auth.users SET email_confirmed_at=now() WHERE id=$1',[d]);
  await db.query('UPDATE profiles SET tos_accepted_at=null WHERE id=$1',[d]);
  await assert.rejects(db.query("SELECT request_join('FRESHX')"),/registration_incomplete/);
  await db.query('UPDATE profiles SET tos_accepted_at=now() WHERE id=$1',[d]);
  await db.query("INSERT INTO content_burn_jobs SELECT id,'pending' FROM couples WHERE invite_code='FRESHX'");
  await assert.rejects(db.query("SELECT request_join('FRESHX')"),/content_cleanup_pending/);
  assert.equal((await db.query("SELECT has_function_privilege('authenticated','guard_onboarding_pairing()','execute') AS allowed")).rows[0].allowed,false);
  assert.equal((await db.query("SELECT has_function_privilege('anon','request_join(text)','execute') AS allowed")).rows[0].allowed,false);
  await db.close();
}
(async()=>{
 await testRegistrationReturn(true);await testRegistrationReturn(false);await testRegistrationReturn(false,true);
 await testOnboarding();await testOnboarding({code:'ACDEFG'});await testOnboarding({code:'ACDEFG',joinFails:true});await testOnboarding({paired:true,code:'ACDEFG'});await testOnboarding({zeroWrite:true});
 await testCallback();await testCallback(true);await testCallback(false,true);await testCallback(true,true);await subscriptionTests();await notificationTests();await databaseTests();
 console.log('PASS: registration/age validation, callback token exchange/recovery, invite preservation, returning pairs, failed writes, real SQL pairing/consent/expiry/cleanup guards and RPC privileges');
})().catch(error=>{console.error(error);process.exitCode=1;});
