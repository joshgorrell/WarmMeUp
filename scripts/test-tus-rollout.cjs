const fs = require('node:fs');
const assert = require('node:assert/strict');
const upload = fs.readFileSync('lib/uploadMedia.ts', 'utf8');
const adapter = fs.readFileSync('lib/nativeTusTransport.ts', 'utf8');
const entry = fs.readFileSync('lib/nativeResumableVideo.ts', 'utf8');
assert.match(upload, /EXPO_PUBLIC_ENABLE_VIDEO_TUS === 'true'/, 'TUS must be opt-in');
assert.match(upload, /uploadNativeVideoResumable\(\{/);
assert.match(upload, /uploadNativeFileWithProgressRetry\(/, 'legacy transport must remain available');
assert.match(upload, /finally\s*\{[\s\S]*cleanupTempFile/, 'temporary media cleanup must remain');
assert.match(adapter, /file\.slice\(offset, offset \+ length\)/, 'native transport must slice file');
assert.match(entry, /uploadTusChunks\(/, 'native entry must use resumable session');
for (const [name, source] of [['media upload', upload], ['native TUS adapter', adapter], ['native TUS entry', entry]]) {
  assert.doesNotMatch(source, /saveToLibraryAsync|createAssetAsync|CameraRoll\.save|MediaLibrary\.save/, name + ' must never save to camera roll');
}
console.log('Guarded TUS rollout and camera-roll privacy source checks passed.');
