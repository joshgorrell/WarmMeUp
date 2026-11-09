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
    Number, Math, URL, TextEncoder, Uint8Array, Error, Object, String, setTimeout,
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
  // Even when every PATCH response is lost, a HEAD-confirmed server commit
  // must count as success rather than a false failed upload.
  let finalOffset = 0;
  const smallSize = 9;
  const alwaysLost = {
    async readChunk(start, length) { return new Uint8Array(length); },
    async request(method) {
      if (method === 'POST') return { status: 201, headers: { location: '/storage/v1/upload/resumable/final' } };
      if (method === 'HEAD') return { status: 200, headers: { 'upload-offset': String(finalOffset) } };
      finalOffset = smallSize;
      throw new Error('PATCH response lost');
    },
  };
  await uploadTusChunks({
    endpoint: 'https://example.supabase.co/storage/v1/upload/resumable',
    bucket: 'vault', objectPath: 'videos/final.mp4', mimeType: 'video/mp4',
    fileSize: smallSize, authorization: 'Bearer test', apiKey: 'test',
    transport: alwaysLost,
  });
  assert.equal(finalOffset, smallSize);
  // Initial HEAD can briefly fail while the network reconnects.
  let headChecks = 0;
  let retryOffset = 0;
  await uploadTusChunks({
    endpoint: 'https://example.supabase.co/storage/v1/upload/resumable',
    bucket: 'vault', objectPath: 'videos/reconnect.mp4', mimeType: 'video/mp4',
    fileSize: 5, authorization: 'Bearer test', apiKey: 'test',
    transport: {
      async readChunk(start, length) { return new Uint8Array(length); },
      async request(method, url, headers, body) {
        if (method === 'POST') return { status: 201, headers: { location: '/storage/v1/upload/resumable/reconnect' } };
        if (method === 'HEAD') {
          headChecks++;
          if (headChecks === 1) throw new Error('Temporary network outage');
          if (headChecks === 2) return { status: 503, headers: {} };
          return { status: 200, headers: { 'upload-offset': String(retryOffset) } };
        }
        retryOffset += body.byteLength;
        return { status: 204, headers: { 'upload-offset': String(retryOffset) } };
      },
    },
  });
  assert.equal(retryOffset, 5);
  assert.equal(headChecks, 3);
  // Authentication failures on HEAD must stop without retrying or sending data.
  let deniedHeads = 0;
  await assert.rejects(uploadTusChunks({
    endpoint: 'https://example.supabase.co/storage/v1/upload/resumable',
    bucket: 'vault', objectPath: 'videos/denied.mp4', mimeType: 'video/mp4',
    fileSize: 5, authorization: 'Bearer test', apiKey: 'test',
    transport: {
      async readChunk() { throw new Error('Should not read'); },
      async request(method) {
        if (method === 'POST') return { status: 201, headers: { location: '/storage/v1/upload/resumable/denied' } };
        deniedHeads++;
        return { status: 403, headers: {} };
      },
    },
  }), /403/);
  assert.equal(deniedHeads, 1);
  // Explicit 503 and 429 responses should retry creation with backoff.
  let createAttempts = 0;
  let createOffset = 0;
  await uploadTusChunks({
    endpoint: 'https://example.supabase.co/storage/v1/upload/resumable',
    bucket: 'vault', objectPath: 'videos/create-retry.mp4', mimeType: 'video/mp4',
    fileSize: 4, authorization: 'Bearer test', apiKey: 'test',
    transport: {
      async readChunk(start, length) { return new Uint8Array(length); },
      async request(method, url, headers, body) {
        if (method === 'POST') {
          createAttempts++;
          if (createAttempts === 1) return { status: 503, headers: {} };
          if (createAttempts === 2) return { status: 429, headers: {} };
          return { status: 201, headers: { location: '/storage/v1/upload/resumable/create-retry' } };
        }
        if (method === 'HEAD') return { status: 200, headers: { 'upload-offset': String(createOffset) } };
        createOffset += body.byteLength;
        return { status: 204, headers: { 'upload-offset': String(createOffset) } };
      },
    },
  });
  assert.equal(createAttempts, 3);
  assert.equal(createOffset, 4);
  // Ambiguous POST network failures must not trigger a second creation.
  let ambiguousPosts = 0;
  await assert.rejects(uploadTusChunks({
    endpoint: 'https://example.supabase.co/storage/v1/upload/resumable',
    bucket: 'vault', objectPath: 'videos/ambiguous.mp4', mimeType: 'video/mp4',
    fileSize: 4, authorization: 'Bearer test', apiKey: 'test',
    transport: {
      async readChunk() { throw new Error('Should not read'); },
      async request(method) {
        if (method !== 'POST') throw new Error('Unexpected request');
        ambiguousPosts++;
        throw new Error('Connection lost after POST');
      },
    },
  }), /Connection lost/);
  assert.equal(ambiguousPosts, 1);
  console.log('TUS resumable session tests passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
