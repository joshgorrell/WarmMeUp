# Capture review

Automated regression: `node scripts/test-capture-review.cjs`. It executes the
actual Chat camera-return and library-picker callbacks and verifies photos and
videos only become attachments for empty, whitespace-only, and captioned drafts.
It also checks a canceled camera return leaves the draft untouched.

Device verification (iPhone, then Android):

1. In Chat with no caption, capture a photo. Check the full photo, Retake, and Use
   Photo. Use Photo must return to the composer with an attachment and no new
   message, upload, or partner notification. Remove it, then repeat and Send.
2. Record a video with sound. On review, tap Play, Pause, scrub backward/forward,
   and replay after reaching the end. Both portrait and landscape recordings
   should fit without cropping; playback controls must not overlap Retake/Use.
3. While playing, Retake: playback stops and the camera reopens. Close/discard:
   playback stops and nothing is attached. Use Video: playback stops and Chat
   shows a removable Video attachment. The partner receives nothing until Send.
4. Repeat with a caption and when replying to a message/dare. Preserve the draft
   and reply context until Send. Choose a photo/video from the library and check
   the same explicit Send requirement.
5. Background/lock the app during video review: audio stops and does not resume
   automatically on return. Check the top close button and bottom action buttons
   are usable around the notch/home indicator.
6. In Vault, capture a photo/video and review/retake. Use Photo/Video continues
   the existing Add to Vault flow. Chat's separate Send requirement does not
   change the Vault workflow.
7. If video decoding fails, display the playback error while keeping Retake,
   discard, and Use Video accessible. No media is sent by the review screen.

Native playback/camera checks require a device; automated callback checks do not
exercise the native decoder, camera, or player controls.
