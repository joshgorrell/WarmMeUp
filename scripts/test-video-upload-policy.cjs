const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync('lib/videoUploadPolicy.ts', 'utf8');
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const mod = { exports: {} };
vm.runInNewContext(js, { module: mod, exports: mod.exports, Math, Number });
const { videoUploadTimeoutMs: deadline } = mod.exports;
assert.equal(deadline(null), 300_000);
assert.equal(deadline(NaN), 300_000);
assert.equal(deadline(-1), 300_000);
assert.equal(deadline(1_000_000), 300_000);
assert.ok(deadline(20_000_000) > 300_000, 'large video gets more time');
assert.ok(deadline(40_000_000) > deadline(20_000_000), 'deadline scales with size');
assert.equal(deadline(2_000_000_000), 1_200_000, 'deadline is bounded');
console.log('Video upload deadline policy tests passed.');
