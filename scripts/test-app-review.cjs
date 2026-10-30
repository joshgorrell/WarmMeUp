// Execute real handlers with isolated auth, RevenueCat and database adapters.
// No accounts, purchases or live data are changed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function load(file, mocks, globals = {}) {
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    reportDiagnostics: true,
  });
  assert.equal(js.diagnostics.length, 0, `${file} parses`);
  const module = { exports: {} };
  new Function('require', 'module', 'exports', ...Object.keys(globals), js.outputText)(
    name => { if (name in mocks) return mocks[name]; throw Error(`Missing mock ${name}`); },
    module, module.exports, ...Object.values(globals));
  return module.exports;
}
const quiet = { log() {}, warn() {}, error() {} };
const future = new Date(Date.now() + 3600000).toISOString();
const past = new Date(Date.now() - 3600000).toISOString();
function rcBody(environment, expires = future) {
  return { subscriber: { entitlements: { premium: { expires_date: expires, product_identifier: 'monthly' } },
    subscriptions: { monthly: environment == null ? {} : { is_sandbox: environment === 'sandbox' } } } };
}
async function edge(file, { environment = 'sandbox', expires = future, partner = false, legacy = false, authorized = true } = {}) {
  let handler; const writes = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: authorized ? { id: 'a' } : null }, error: null }) },
    from(table) {
      let id;
      const chain = {
        select() { return chain; }, eq(key, value) { if (key === 'user_id' || key === 'id') id = value; return chain; },
        or() { return chain; }, not() { return chain; },
        upsert(row) { writes.push(row); return Promise.resolve({ error: null }); },
        update() { return chain; },
        maybeSingle: async () => ({ data: table === 'couples' && partner ? { id: 'pair', user_a_id: 'a', user_b_id: 'b' }
          : table === 'subscriptions' && legacy ? { user_id: id, status: 'active', plan: 'monthly', expires_at: future, purchase_environment: 'sandbox' }
          : null, error: null }),
      };
      return chain;
    },
  };
  load(file, { 'jsr:@supabase/functions-js/edge-runtime.d.ts': {}, 'npm:@supabase/supabase-js@2': { createClient: () => client } }, {
    Deno: { serve: fn => handler = fn, env: { get: () => 'test-only' } }, console: quiet,
    fetch: async url => new Response(JSON.stringify(partner && url.endsWith('/a') ? { subscriber: {} } : rcBody(environment, expires))),
  });
  const response = await handler(new Request('https://test.invalid', { method: file.includes('confirm-') ? 'POST' : 'GET', headers: authorized ? { Authorization: 'Bearer test' } : {} }));
  return { status: response.status, body: await response.json(), writes };
}
async function main() {
  const confirm = 'supabase/functions/confirm-subscription/index.ts';
  const effective = 'supabase/functions/get-effective-subscription/index.ts';
  for (const environment of ['sandbox', 'production']) {
    const purchase = await edge(confirm, { environment });
    assert.equal(purchase.status, 200); assert.equal(purchase.body.ok, true);
    assert.equal(purchase.writes[0].purchase_environment, environment);
    const own = await edge(effective, { environment });
    assert.equal(own.body.isPremium, true); assert.equal(own.body.source, 'self');
    assert.equal(own.body.purchaseEnvironment, environment);
    const shared = await edge(effective, { environment, partner: true });
    assert.equal(shared.body.source, 'partner'); assert.equal(shared.body.canInvite, false);
    assert.equal(shared.body.purchaseEnvironment, environment);
  }
  assert.equal((await edge(confirm, { environment: null })).status, 402);
  assert.equal((await edge(confirm, { expires: past })).status, 402);
  assert.equal((await edge(confirm, { authorized: false })).status, 401);
  for (const options of [{ environment: null }, { expires: past }, { expires: past, legacy: true }]) {
    assert.equal((await edge(effective, options)).body.isPremium, false);
  }
  let request; const session = { user: { id: 'a', user_metadata: {} }, session: { access_token: 'test' } };
  let credential = { identityToken: 'test-identity', fullName: { givenName: 'Test', familyName: 'Apple' } };
  let nativeError = null;
  let tokenError = null;
  let tokenData = session;
  const oauth = load('lib/oauth.ts', {
    'react-native': { Platform: { OS: 'ios' } }, 'expo-web-browser': { maybeCompleteAuthSession() {} },
    'expo-auth-session': {}, 'expo-apple-authentication': {
      isAvailableAsync: async () => true, AppleAuthenticationScope: { FULL_NAME: 1, EMAIL: 2 },
      signInAsync: async () => { if (nativeError) throw nativeError; return credential; },
    }, 'expo-crypto': { randomUUID: () => 'raw-nonce', digestStringAsync: async () => 'hashed', CryptoDigestAlgorithm: { SHA256: 'sha256' } },
    './supabase': { supabase: { auth: { signInWithIdToken: async options => { request = options; return { data: tokenData, error: tokenError }; }, updateUser: async () => ({ error: null }) } } },
    './logger': { logger: quiet }, './debugLog': { logDebugEvent() {} },
  });
  const result = await oauth.signInWithProvider('apple');
  assert.equal(request.nonce, 'rawnonce'); assert.equal(request.token, 'test-identity');
  assert.equal(result.user.user_metadata.first_name, 'Test');
  assert.equal(result.user.user_metadata.last_name, 'Apple');
  credential = { identityToken: 'test-identity', fullName: null };
  tokenData = { user: { id: 'a', user_metadata: { first_name: 'Saved' } }, session: { access_token: 'test' } };
  assert.equal((await oauth.signInWithProvider('apple')).user.user_metadata.first_name, 'Saved');
  nativeError = { code: 'ERR_REQUEST_CANCELED' };
  assert.equal(await oauth.signInWithProvider('apple'), null);
  nativeError = null;
  tokenData = { user: null, session: null };
  await assert.rejects(oauth.signInWithProvider('apple'), /did not create a session/);
  tokenError = { message: 'invalid token audience', code: 'invalid_token' };
  await assert.rejects(oauth.signInWithProvider('apple'), /could not verify this app/);
  console.log('PASS: sandbox/production purchases, partner access, expiration, unverified and legacy rejection, unauthorized access, Apple nonce, names, repeat authorization, cancellation and authentication failures');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
