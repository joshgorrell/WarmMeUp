const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync('lib/uploadProgress.ts', 'utf8');
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const callbacks = [];
const moduleRef = { exports: {} };
vm.runInNewContext(js, {
  module: moduleRef, exports: moduleRef.exports,
  Set, Math, setTimeout: fn => { callbacks.push(fn); return callbacks.length; },
});
const progress = moduleRef.exports;
progress.beginUploadProgress('Video A');
progress.setUploadProgressPct(65);
assert.equal(progress.getUploadProgressState().pct, 65);
progress.finishUploadProgress();
assert.equal(progress.getUploadProgressState().pct, 100);
progress.beginUploadProgress('Video B');
progress.setUploadProgressPct(30);
callbacks.shift()();
assert.equal(progress.getUploadProgressState().visible, true, 'old completion must not hide new upload');
assert.equal(progress.getUploadProgressState().label, 'Video B');
assert.equal(progress.getUploadProgressState().pct, 30);
progress.finishUploadProgress();
callbacks.shift()();
assert.equal(progress.getUploadProgressState().visible, false, 'current completion must hide');
progress.beginUploadProgress('Video C');
progress.finishUploadProgress();
progress.cancelUploadProgress();
progress.beginUploadProgress('Video D');
callbacks.shift()();
assert.equal(progress.getUploadProgressState().label, 'Video D', 'cancelled completion must not hide later upload');

const first = progress.startScopedUpload('Chat video');
progress.updateScopedUpload(first, 42);
const second = progress.startScopedUpload('Vault video');
progress.updateScopedUpload(second, 12);
progress.updateScopedUpload(first, 67);
assert.equal(progress.getUploadProgressState().label, 'Vault video');
assert.equal(progress.getUploadProgressState().pct, 12);
progress.endScopedUpload(second, true);
assert.equal(progress.getUploadProgressState().label, 'Chat video');
assert.equal(progress.getUploadProgressState().pct, 67);
progress.endScopedUpload(first, true);
assert.equal(progress.getUploadProgressState().pct, 100);
const third = progress.startScopedUpload('New upload');
callbacks.shift()(); // previous scoped completion callback
assert.equal(progress.getUploadProgressState().label, 'New upload');
progress.endScopedUpload(third, false);
assert.equal(progress.getUploadProgressState().visible, false);

console.log('Upload progress lifecycle tests passed.');
