const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync('lib/videoDurationPolicy.ts', 'utf8');
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const moduleRef = { exports: {} };
vm.runInNewContext(js, { module: moduleRef, exports: moduleRef.exports, Number });
const { MAX_SHARED_VIDEO_DURATION_MS, isLibraryVideoTooLong } = moduleRef.exports;
assert.equal(MAX_SHARED_VIDEO_DURATION_MS, 60000);
for (const duration of [0, 1, 59_999, 60_000]) {
  assert.equal(isLibraryVideoTooLong({ type: 'video', duration }), false, `accept ${duration}ms`);
}
for (const duration of [60_001, 61_000, 120_000]) {
  assert.equal(isLibraryVideoTooLong({ type: 'video', duration }), true, `reject ${duration}ms`);
}
assert.equal(isLibraryVideoTooLong({ mimeType: 'VIDEO/MP4', duration: 61_000 }), true);
assert.equal(isLibraryVideoTooLong({ type: 'image', mimeType: 'image/jpeg', duration: 61_000 }), false);
for (const duration of [undefined, null, NaN, Infinity, -Infinity]) {
  assert.equal(isLibraryVideoTooLong({ type: 'video', duration }), false, 'unknown duration');
}
console.log('Library video duration boundary tests passed.');
