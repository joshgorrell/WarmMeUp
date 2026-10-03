# Warm Me Up privacy and deletion audit — October 3, 2026

## Result

Repository fixes and adversarial regression tests are complete. **This is not a production security certification or a promise of erasure from every backup/device.** Production Supabase project `vdhrcbaggplcktjamwcj` is inaccessible to the connected account. No customer content was read, downloaded or deleted during this work.

Reviewed main: `2447a526692fde7db2b1b318c998d92f07c14439`. The PR contains two migrations, six Edge Function changes/new functions, app changes, and regression tests. See `privacy-burn-deployment.md` for the required rollout and live checks.

## Repaired isolation failures

| Finding | Implemented repair |
|---|---|
| Service-role vault copying accepted another couple's thumbnail path. | Verify the source chat record and exact source sidecar; reject foreign/malformed paths before Storage operations. |
| Screenshot notifications fetched foreign message/vault metadata. | Bind every privileged lookup to the verified couple and a non-deleted source; reject mixed foreign IDs. |
| Wipe RPC trusted a supplied user ID and was client-callable. | Revoke client/PUBLIC execution; service-only access through verified endpoints. Repair broken row-count accumulation. |
| Activity rows could name a foreign couple/target/source. | Restrictive active-couple RLS and same-couple reference constraints; client updates limited to read state. |
| Direct couple INSERT could forge membership. | Client may insert only its own user-A column; verified pairing RPCs handle pairing. |
| Storage access did not require an active couple; only uploader could delete files. | Private buckets, restrictive active-couple policies, and deletion permission for either active partner. |
| Avatar visibility was uncertain, while app stored public-format URLs. | Force avatar bucket private; restrictive owner/active-partner read and owner-only writes. App resolves authorized short-lived signatures and disables image disk caching. Stored public-format URLs now serve only as locators. |

The original privileged endpoint holes were reproduced against the original source and rejected against repaired source. The tests do not establish that production previously matched every historical policy snapshot.

## Repaired deletion behavior

| Path | New behavior |
|---|---|
| Individual Chat/Vault burns | Server validates actor/couple/IDs, captures all linked saved copies and thumbnails, and hard-deletes records in one database transaction with the durable file manifest. |
| Multiple Vault items, selected pages, Burn It All | One server request/receipt replaces independent best-effort client calls. Full burns inventory all objects in both couple folders, including abandoned uploads. |
| Wishes | Delete original/completion images and their thumbnails; remove reactions and copied activity/chat payloads. |
| Dice/dare history and activity | Delete interactions and their linked response media/cards; activity-page clearing also removes chat activity-card copies. |
| Old installed clients | Database triggers convert tombstone writes into hard deletion and capture direct deletes for cleanup. Their old UI cannot be corrected until the app update is installed. |
| Timers | PostgreSQL cron enqueues expired Chat/Vault content every minute even with both apps closed. Physical deletion runs in a separately scheduled server worker. Healthy processing has scheduling latency; this is not an exact-deadline global-erasure guarantee. |
| Disconnect | Atomically delete shared rows and deactivate the relationship; preserve a retryable inventory if Storage fails. Return pending rather than claiming file completion. |
| Account deletion | Preserve all couple/avatar inventories before any auth cascade. Lock the account and retry file cleanup; delete reviewer entitlement, personal rows and auth user only after file cleanup is confirmed. Removing either account deletes shared relationship content for both partners. |
| Historic orphans | Hourly inventory identifies unreferenced couple media older than 24 hours, allowing a grace period for uploads. Live references and new uploads are excluded. |

Files are deleted through the **Storage API**, not by deleting `storage.objects` in SQL. API errors retain the inventory. Acknowledgment checks actual Storage metadata; an API response claiming success while metadata remains cannot discard a path or complete a job. Jobs process bounded 500-path batches and retry automatically, with backoff capped at one hour.

Retries after rows are already hard-deleted include outstanding couple manifests; an empty retry cannot falsely claim file completion. Vault copies reserve their destinations before external copy requests. Burns include reserved destinations and remain pending while an existing copy lease is active. Lease timeout is ten minutes to recover abandoned function invocations; deployed platform/in-flight request behavior still needs live verification.

FK `ON DELETE SET NULL` can erase the copy graph before an AFTER DELETE trigger. A BEFORE DELETE snapshot retains relationship IDs, and tests exercise that real FK behavior. No original text/media payload is retained in the cleanup tables. File inventories and link IDs are removed upon verified completion. Minimal receipt IDs/couple/actor/kind/state expire after seven days; pending account requests retain their necessary completed receipts until finalization.

## App and device handling

- Current item/page operations report completion only after the server receipt confirms it. Outages return a pending/error message; queued server cleanup survives app closure.
- Private image views use `cachePolicy="none"`; video sources explicitly disable Expo video caching.
- Sign-out/account changes clear the shared gallery, URL store, diagnostic event store and managed image caches.
- Upload, avatar-picker, compressed-image and thumbnail temporary files are cleaned in `finally`, including failures, using SDK 54's supported legacy FileSystem APIs. Cleanup stays inside the app cache directory and rejects traversal/shared-library references.
- Media and avatar signatures last five minutes; the in-memory URL cache expires sooner. Existing previously issued URLs are not retroactively shortened.
- A content-free, RLS-authorized couple revision signal refreshes screens after deletions, with polling/reconnect fallback. This avoids subscribing to global DELETE IDs, which Realtime cannot reliably filter by couple.
- Active full-screen viewers recheck availability/authorization every five seconds and on resume; unavailable content closes the viewer. This is bounded refresh behavior, not instantaneous erasure of already-loaded pixels.

The app cannot force an offline/modified partner device to erase already-downloaded bytes, screenshots, camera originals, exported files, OS/browser/video buffers, device backups or forensic remnants. Native-device verification is still required. App-managed cache cleanup is not a forensic-erasure certification.

## Apple reviewer access

`permanent_review_access` is an explicit user-ID premium entitlement, separate from admin flags. It grants features, not a global private-content bypass. The fixed authorization paths apply to reviewers too.

The actual two Apple logins are **not verified**. Run the supplied live verification SQL to confirm they are non-admin/non-super-admin and paired only with each other in the test couple. Test them against an unrelated couple using actual user JWTs, including forged IDs/paths and Storage requests. Never give Apple a service key, real customer's login, or admin account.

## Remaining production limits

1. **Live catalogs/configuration:** historical exports are not production truth. Verify current policies, function ACLs/bodies, bucket privacy, cron jobs, deployed function versions, and reviewer flags. Run Supabase security advisors. Some exported baseline statements are invalid SQL, so fixture tests reconstruct relevant schema/policies rather than replaying the entire dump.
2. **Backups/PITR:** text in inspected database paths is not E2EE. Hard deletion does not erase earlier database backups. Verify actual retention, expiry and restore procedures. Restoring an old backup must not silently restore deleted content; maintain a deletion registry outside the backup being restored or another verified restore-time deletion mechanism. Receipt cleanup alone is not such a registry. Stronger cryptographic erasure requires a complete key lifecycle whose old decryption keys cannot also be restored.
3. **Storage/CDN:** Supabase documents deletion invalidation as potentially taking up to 60 seconds; browser caches can survive it. Database backups exclude Storage object bytes, but any separate exports/copies must be checked. Previously public avatar caches require particular attention.
4. **Deployment is mandatory:** merging/EAS alone does not deploy server functions, apply migrations, set the worker project URL, or establish cron health. Monitor pending jobs and account requests; do not treat a stalled queue as completed deletion.
5. **Native/provider testing:** Storage faults, long-running copy/upload races, stale JWTs, partner background/offline behavior and native cache/device-backup behavior remain necessary acceptance tests. SDK web compilation cannot establish them.

## Validation

- `scripts/test-privacy-boundaries.cjs`: actual old/repaired Edge handlers with controlled Auth/Storage/database doubles; isolated PostgreSQL RLS and service-only wipe tests. Its tombstone-gap test intentionally describes the first migration alone.
- `scripts/test-content-burns.cjs`: actual second migration against isolated PostgreSQL; hard deletion, foreign denial, linked copies with FK SET NULL, false Storage success, in-flight copy leases, retry after rows vanish, old clients, wish images/cards, server timers, orphan grace/reference protection, avatar isolation and account manifest ordering. Hosted cron/net/Vault wiring is excluded from this fixture.
- `scripts/test-content-burn-worker.cjs`: actual worker source with fault injection; transient errors, false successes, crash after deletion/before acknowledgment, >1,000 paths, and no premature auth deletion.
- TypeScript and Expo web export pass. No new lint errors compared with the unchanged main baseline; existing lint errors remain.
- Live Supabase/iOS/Android tests did not run. Production readiness depends on the deployment and verification guide.

Primary documentation checked: [Storage deletion](https://supabase.com/docs/guides/storage/management/delete-objects), [scheduled functions](https://supabase.com/docs/guides/functions/schedule-functions), [backups](https://supabase.com/docs/guides/platform/backups), [Storage CDN](https://supabase.com/docs/guides/storage/cdn/smart-cdn), [SDK 54 FileSystem](https://docs.expo.dev/versions/v54.0.0/sdk/filesystem/) and [Expo Image](https://docs.expo.dev/versions/v54.0.0/sdk/image/).
