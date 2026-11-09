const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const js = ts.transpileModule(fs.readFileSync('lib/tusUploadPolicy.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const mod = { exports: {} };
vm.runInNewContext(js, { module: mod, exports: mod.exports, Number, Math, URL });
const p = mod.exports;
const chunk = 6 * 1024 * 1024;
assert.equal(p.tusChunkLength(0, chunk * 2 + 17), chunk);
assert.equal(p.tusChunkLength(chunk * 2, chunk * 2 + 17), 17);
assert.equal(p.tusChunkLength(chunk * 2 + 17, chunk * 2 + 17), 0);
assert.throws(() => p.tusChunkLength(-1, chunk));
assert.throws(() => p.tusChunkLength(chunk + 1, chunk));
assert.equal(p.parseTusOffset('0', chunk), 0);
assert.equal(p.parseTusOffset(String(chunk), chunk), chunk);
for (const value of [null, '-1', '1.5', '01', 'NaN', String(chunk + 1)]) {
  assert.throws(() => p.parseTusOffset(value, chunk));
}
assert.equal(p.encodeTusMetadata({ bucketName: 'vault', contentType: 'video/mp4' }),
  'bucketName dmF1bHQ=,contentType dmlkZW8vbXA0');
assert.equal(p.encodeTusMetadata({ objectName: 'été.mp4' }), 'objectName w6l0w6kubXA0');
// Run inside a VM with no TextEncoder to simulate Hermes globals.
for (const input of ['plain', 'été.mp4', '日本語.mov', '🎥.mp4', '\\ud800bad']) {
  assert.deepEqual(Array.from(p.tusUtf8Bytes(input)), Array.from(new TextEncoder().encode(input)));
}
assert.equal(p.encodeTusMetadata({ objectName: '🎥.mp4' }), 'objectName 8J+OpS5tcDQ=');
const endpoint = 'https://example.supabase.co/storage/v1/upload/resumable';
assert.equal(p.resolveTusLocation(endpoint, '/storage/v1/upload/resumable/abc'),
  'https://example.supabase.co/storage/v1/upload/resumable/abc');
for (const url of ['https://evil.example/storage/v1/upload/resumable/abc',
  '/storage/v1/object/private', '//evil.example/storage/v1/upload/resumable/abc']) {
  assert.throws(() => p.resolveTusLocation(endpoint, url));
}
assert.ok(p.isRetryableTusStatus(503));
assert.ok(!p.isRetryableTusStatus(403));
console.log('TUS protocol policy tests passed.');
