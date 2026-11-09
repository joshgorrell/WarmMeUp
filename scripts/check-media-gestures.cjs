// Lightweight regression guard: prevents media-transfer changes from accidentally
// removing the existing gallery navigation and iPhone-style photo gestures.
// Device gesture interaction still requires manual iOS/Android testing.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const zoom = fs.readFileSync('components/note/ZoomablePhoto.tsx', 'utf8');
const gallery = fs.readFileSync('app/(app)/vault-viewer.tsx', 'utf8');
for (const [name, pattern] of [
  ['pinch zoom', /Gesture\.Pinch\(/],
  ['zoomed photo pan', /Gesture\.Pan\(\)/],
  ['vertical dismiss', /dismissGesture\s*=\s*Gesture\.Pan\(/],
  ['dismissal blocked while zoomed', /\.enabled\(!isZoomed\)/],
  ['both vertical dismissal directions', /Math\.abs\(e\.translationY\)\s*>\s*DISMISS_DISTANCE/],
  ['photo gesture composition', /Gesture\.Simultaneous\(pinchGesture, panGesture, dismissGesture/],
]) assert.match(zoom, pattern, `Missing media gesture: ${name}`);
assert.match(gallery, /<ZoomablePhoto/, 'Gallery must use zoomable photo viewer');
assert.match(gallery, /horizontal\s*\n\s*pagingEnabled/, 'Gallery must retain horizontal paging');
console.log('Media gesture source guards passed (manual device tests still required).');

const upload = fs.readFileSync('lib/uploadMedia.ts', 'utf8');
for (const [name, pattern] of [
  ['native file streaming', /FileSystem\.createUploadTask\(/],
  ['picker URI cache staging', /stageNativeVideoForUpload\(uploadUri/],
  ['staged file cleanup', /tempFiles\.add\(stagedUri\)/],
  ['native upload timeout', /300_000/],
  ['native upload cancellation', /task\.cancelAsync\(\)/],
  ['bounded native cancellation', /cancelTimer\s*=\s*setTimeout\(/],
  ['no retry on unconfirmed cancellation', /shouldRetryUploadError\(error\)/],
  ['classify retryable transport errors', /shouldRetryUploadError\(error\)/],
  ['native byte progress', /totalBytesSent\s*\/\s*event\.totalBytesExpectedToSend/],
  ['web byte progress', /xhr\.upload\.onprogress/],
  ['shared retry policy', /RETRYABLE_UPLOAD_STATUSES\.has\(/],
  ['original media upload', /uploadNativeFileWithProgressRetry\(/],
  ['60-second picker limit', /videoMaxDuration:\s*60/],
  ['thumbnail processing', /pendingThumbPromise/],
]) assert.match(upload, pattern, `Missing media transfer safeguard: ${name}`);
console.log('Media transfer source guards passed.');
