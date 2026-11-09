# Media release verification — PR #41

Automated CI is a prerequisite, not a substitute for native-device verification.

## Devices
Test on at least one physical iPhone and one physical Android device using a build that includes the PR. Record OS version, app build, network conditions, and pass/fail for each case.

## Uploads (Chat and Vault)
- [ ] Send a 60-second camera video on Wi-Fi; verify it uploads, shows a poster, and plays the **original** media.
- [ ] Send a 60-second library video over cellular; verify measured progress and playback.
- [ ] Upload HEIC, JPEG, PNG with transparency, and GIF/WebP; check orientation, color, transparency/animation, and original resolution in full-screen view.
- [ ] Switch between Wi-Fi and cellular during a video upload; confirm a clear retry or failure state and no duplicate Chat/Vault entries.
- [ ] Interrupt connectivity during an upload; restore connectivity and confirm retry succeeds or reports a recoverable error.
- [ ] Force an upload stall lasting longer than five minutes; verify cancellation occurs and retries do not overlap. **Do not wait for this in a routine smoke test; use controlled network throttling.**
- [ ] After three failed attempts, confirm the user sees an actionable error and can retry from the composer.
- [ ] Verify media is accessible only to the paired users; signed URLs must expire and should not be logged.

## Viewer regressions
- [ ] Swipe **up** and **down** to dismiss an unzoomed photo.
- [ ] Pinch in/out, double-tap zoom, and pan an enlarged photo without accidental dismissal.
- [ ] Swipe horizontally through photos; ensure vertical dismissal does not steal the gesture.
- [ ] Open, pause, and resume video; swipe to another gallery item and confirm the prior video's audio stops.
- [ ] Confirm photo and video posters load correctly on slow networks.
- [ ] Close Vault and trigger its privacy lock; confirm no exposed media remains on screen.

## Release gate
- [ ] GitHub Actions TypeScript and media regression checks pass on the final commit.
- [ ] Device tests above pass, with defects documented and fixed.
- [ ] Review Supabase storage permissions and signed URL handling.
- [ ] Only then merge and produce a release build.

Current retries restart an upload; they are **not** byte-range resumable. No video transcoding is included in PR #41.
