// Behavioral tests for the real TypeScript retry policy (not source-pattern guards).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync('lib/mediaRetryPolicy.ts', 'utf8');
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const moduleRef = { exports: {} };
vm.runInNewContext(js, { module: moduleRef, exports: moduleRef.exports, Set, Error });
const { RETRYABLE_UPLOAD_STATUSES, shouldRetryUploadError } = moduleRef.exports;

for (const status of [408, 429, 500, 502, 503, 504]) {
  assert.equal(RETRYABLE_UPLOAD_STATUSES.has(status), true, `HTTP ${status} should retry`);
}
for (const status of [200, 201, 400, 401, 403, 404, 409, 413, 415, 422]) {
  assert.equal(RETRYABLE_UPLOAD_STATUSES.has(status), false, `HTTP ${status} must not retry`);
}
for (const message of [
  'Network request failed', 'Connection lost during upload',
  'Upload timed out', 'Network offline', 'Failed to fetch',
  'Socket closed', 'Transport error',
]) assert.equal(shouldRetryUploadError(new Error(message)), true, message);

for (const message of [
  'Permission denied', 'Unauthorized', 'Forbidden',
  'File not found', 'No such file', 'Could not read media file',
  'Upload was interrupted', 'Upload cancelled',
  'Video upload stopped responding. Please retry after checking your connection.',
  'Invalid MIME type', 'Upload failed (HTTP 413)',
]) assert.equal(shouldRetryUploadError(new Error(message)), false, message);

assert.equal(shouldRetryUploadError(null), false);
assert.equal(shouldRetryUploadError('Network failed'), false);
console.log('Media retry policy behavioral tests passed.');
