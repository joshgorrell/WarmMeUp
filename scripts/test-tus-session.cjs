const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(path, imports = {}) {
  const js = ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(js, {
    module, exports: module.exports, require: name => imports[name],
    Number, Math, URL, TextEncoder, Uint8Array, Error, Object, String,
  });
  return module.exports;
}
const policy = load('lib/tusUploadPolicy.ts');
const { uploadTusChunks } = load('lib/tusUploadSession.ts', { './tusUploadPolicy': policy });
(async () => {
  const total = 6 * 1024 * 1024 + 3;
  let offset = 0;
  let lostResponse = true;
  const sent = [];
  const progress = [];
  const transport = {
    async readChunk(start, length) {
      assert.equal(start, offset);
      return new Uint8Array(length);
    },
    async request(method, url, headers, body) {
      if (method === 'POST') {
        assert.equal(headers['Upload-Length'], String(total));
        return { status: 201, headers: { location: '/storage/v1/upload/resumable/session1' } };
      }
      if (method === 'HEAD') return { status: 200, headers: { 'upload-offset': String(offset) } };
      assert.equal(method, 'PATCH');
      assert.equal(headers['Upload-Offset'], String(offset));
      sent.push(body.byteLength);
      offset += body.byteLength;
      if (lostResponse) {
        lostResponse = false;
        throw new Error('Response lost after server accepted bytes');
      }
      return { status: 204, headers: { 'upload-offset': String(offset) } };
    },
  };
  const url = await uploadTusChunks({
    endpoint: 'https://example.supabase.co/storage/v1/upload/resumable',
    bucket: 'vault', objectPath: 'videos/test.mp4', mimeType: 'video/mp4',
    fileSize: total, authorization: 'Bearer test', apiKey: 'test',
    transport, onProgress: n => progress.push(n),
  });
  assert.equal(url, 'https://example.supabase.co/storage/v1/upload/resumable/session1');
  assert.equal(offset, total);
  assert.equal(sent.length, 2, 'lost response must not resend accepted chunk');
  assert.equal(sent[0], policy.TUS_CHUNK_BYTES);
  assert.equal(sent[1], 3);
  assert.equal(progress.at(-1), 1);
  console.log('TUS resumable session tests passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
