# Warm Me Up privacy and deletion audit — October 3, 2026

**Result: NOT a clean security sign-off.** Source-confirmed isolation holes were reproduced and repaired in this change. Permanent deletion, live reviewer privileges, production policies, backup retention, and device erasure remain unverified or fail the requested guarantees.

Reviewed base: `2447a526692fde7db2b1b318c998d92f07c14439` (main after first-moment fix).

This is a repository/code audit with isolated PostgreSQL and mocked Edge Function execution, not a production penetration test or a forensic device examination. The connected Supabase account cannot access WarmMeUp project `vdhrcbaggplcktjamwcj`. No real user content was read, downloaded, or deleted.

## Findings and implemented repairs

| Severity | Finding | Evidence | Repair in this change |
|---|---|---|---|
| Critical | Privileged vault copy accepted an arbitrary thumbnail source from another couple. | `copy-to-vault/index.ts` validated the main source, but passed client `thumbnail_path` directly to service-role Storage copy. The old handler copied a simulated foreign file into the caller's vault. | Reject malformed path inputs; require the thumbnail to be the exact sidecar of the verified source message. Tests prove the foreign copy is rejected before storage operations. |
| High | Screenshot endpoint disclosed foreign item metadata into the caller's activity feed. | `notify-screenshot/index.ts` authenticated couple membership, then fetched a separately supplied vault/message ID using service role without binding it to that couple. Tests reproduce foreign storage-path metadata disclosure for both item types. | Bind every privileged item lookup to verified couple ID and non-deleted content. Reject foreign, missing, and ambiguous mixed requests before creating an event. |
| High | Wipe RPC trusted supplied identity and was executable by signed-in clients. | `wipe_couple_data(p_couple_id,p_user_id)` compared `p_user_id` to stored members without binding it to authenticated identity. Its grant exposed the RPC to `authenticated`. Source also incorrectly used a JSON accumulator for integer row counts. | Revoke client/PUBLIC execution; explicitly grant only `service_role`, used by the authenticated `disconnect-couple` endpoint. Repair row-count accumulation. Client spoofed RPC is denied; verified service-role fixture disconnect succeeds. This does not establish that the old production body matched the repository. |
| High | Existing activity policies allowed a caller to name another couple/target/source record. | Baseline INSERT checked only `actor_user_id`; SELECT checked actor or target, not membership. | Restrictive active-couple policies intersect existing permissive policies. Event inserts additionally constrain target, wish, and vault references. Clients can update only the read flag. |
| High | Direct couple insertion could invent a relationship if table INSERT grants matched the source policy. | Baseline INSERT checks only `user_a_id`; update-column hardening does not secure INSERT. The repository references an older membership guard without providing its current body. | Limit client INSERT to `user_a_id`; verified pairing RPCs retain privileged access. Fixture rejects inserting a stranger as user B. Actual production grants/guard still require inspection. |
| High | Storage access did not consistently require an active relationship, and shared media deletion was uploader-only. | Storage snapshot policies are folder/member scoped without `active`; DELETE checks uploader folder. This could leave partner-uploaded media behind after a burn. | Force chat/vault buckets private, revoke anon object access, add restrictive active-couple Storage boundary, allow either active partner to delete shared files. Tests deny foreign storage reads/deletes and allow a partner to burn an uploader's shared file. |
| Medium | Private images used persistent disk caches; session changes did not clear gallery/signed-URL stores. | Explicit `cachePolicy="memory-disk"`; AuthContext reset account state but not those stores. | Disable explicit persistent image caching and clear gallery, URL, diagnostic, and managed image caches on sign-out and account changes. This is app-level cleanup, not forensic erasure. |
| Medium | Temporary-file cleanup used deprecated SDK 54 APIs and did not enforce its documented cache-only boundary. | `mediaCache.ts` imported `getInfoAsync/deleteAsync` from the root FileSystem module and swallowed failures. SDK 54 documents those root methods as runtime-throwing. | Use `expo-file-system/legacy`; restrict cleanup to the app cache directory and reject traversal/shared-library URIs. |

## Permanent deletion: unresolved blockers

| Path | Current behavior | Why it does not meet the requirement |
|---|---|---|
| Individual chat burn and expired messages | Set `chat_messages.deleted_at`; attempt best-effort storage removal and linked vault soft deletion. | Message text, identifiers, and media pointers remain in database rows. The Data API policies do not themselves hide tombstones from the owning couple. No verified hard purge occurs. |
| Individual/bulk vault deletion and viewer deletion | Set `vault_items.deleted_at`, clear some UI state, attempt storage removal. | Several paths omit blurred thumbnails, retain rows, ignore errors, or clear UI before all work completes. The uploader-only permission gap is repaired, but error/retry handling is not. |
| Wish deletion | Hard-delete wish; mark matching chat activity deleted. | Wish original and completion image files are not removed by this path. Related activity-card copies can retain text in soft-deleted chat rows. |
| Delete a category / Burn It All | Client executes many independent database deletions and folder-removal calls. | Returned Supabase errors are largely ignored. The UI can report success after partial failure. There is no atomic server manifest, durable cleanup job, retry worker, or completion verification. Selected-category deletion also does not consistently remove every linked copy. |
| Timed burn | Client detects expiry when viewing/loading chat. | The repository contains no scheduled server burn worker. Expired content may remain if both apps are closed/offline. A live externally configured scheduler could exist; inspect production. |
| Disconnect / account deletion | Service-role cleanup with best-effort storage calls; account deletion removes auth user before later cleanup. | Storage failures can leave files. Auth cascades can remove the rows needed to discover storage paths. Reviewer access has an auth-user foreign key with `ON DELETE RESTRICT`, which can interfere with deleting those accounts. Server wipe count bug is repaired, but the overall storage cleanup pipeline is not replaced here. |
| Linked/cross-saved content | Chat can be copied into Vault, with a single link on the message and potentially multiple copies. | Deleting one item must resolve all associated originals, thumbnails, vault copies, activity payloads, reactions, and upload remnants. Current paths do not prove that graph is fully removed. |

**Do not present this PR as a complete burn-system repair.** Adding a SELECT tombstone filter alone is unsafe: PostgreSQL can apply that policy to the new UPDATE row and reject the existing soft-burn operation. A verified server burn API and coordinated client rollout are required.

## Apple review accounts

The source's `permanent_review_access` record is an explicit user-ID-based premium entitlement. It grants features, not admin status or a global data-access exemption. The subscription response for reviewers is separate from `is_admin`/`is_super_admin`, and ordinary couple policies still apply.

This does **not** verify the actual two logins supplied to Apple. Confirm both are the intended test users, neither profile is admin/super-admin, both belong only to their test relationship, and neither has another real customer's login/token. The privileged-function vulnerabilities above apply to ordinary authenticated reviewers as well as any other authenticated user until the repaired functions are deployed. `privacy_live_verification.sql` provides content-free checks for these conditions.

## Media URLs, backups, and devices

- Signed private-media URLs are bearer capabilities. The code creates URLs lasting 1–24 hours and keeps a cross-navigation URL cache for 11.5 hours. Anyone holding a valid URL can fetch it; issuing the URL checks authorization, but each subsequent bearer-URL request does not establish the viewer's couple membership. The hardened session cleanup reduces cross-account reuse but does not revoke old URLs.
- Supabase documents CDN invalidation after deletion as potentially taking up to 60 seconds; browser caches may survive that invalidation. An immediate global-erasure claim is therefore unsupported.
- Database text is not application-level/end-to-end encrypted in the inspected paths. Hard deletion does not remove older database backups or point-in-time recovery history. Supabase database backups do not include Storage object bytes, but separate storage exports or copies must be checked.
- The repo's bucket baseline declares all three buckets private, while avatar upload code stores `getPublicUrl()` URLs. Inspect actual avatar bucket visibility and implement authorized avatar retrieval if it is private. Do not infer current visibility from the old snapshot.
- This PR prevents explicit new disk caching by the affected Expo image views and fixes managed temporary-file cleanup. It cannot erase an offline partner's loaded media, existing OS/browser/network caches, device backups, forensic remnants, screenshots, camera-roll originals, or files intentionally exported outside the app. Video playback cache behavior needs native-device verification too.
- Upload cleanup remains best-effort and is not consistently in a finally block; failed uploads, picker copies, and native thumbnail/video operations can leave temporary data.

Primary documentation checked:
- https://supabase.com/docs/guides/platform/backups
- https://supabase.com/docs/guides/storage/serving/downloads
- https://supabase.com/docs/guides/storage/cdn/smart-cdn
- https://supabase.com/docs/guides/storage/schema/design
- https://docs.expo.dev/versions/v54.0.0/sdk/image/
- https://docs.expo.dev/versions/v54.0.0/sdk/filesystem/

## Review coverage and remaining production checks

Reviewed the authorization patterns for auth/pairing, profiles/settings, chat, dice, dares/asks, wishes, vault/gallery, activity/reactions, points/streaks, notifications, reviewer subscriptions, admin aggregates, diagnostic/feedback collection, account deletion, disconnect, and media upload/copy. Review and admin roles are distinct in source; profiles/admin operations retain separate authorization checks. Aggregate-only admin content RPCs exist in the September migration. Push notification source avoids sending media/message bodies; diagnostic snapshots export event tags rather than debug-event payloads.

Older policy snapshots and exported baseline SQL are not live truth. Some baseline statements are not replayable as written (INSERT USING clauses, malformed storage-policy parentheses, extension-view pseudo-table types). Tests reconstruct only relevant schema/policies and normalize the exported INSERT syntax. They prove the new migration and tested logic against that fixture, not a byte-for-byte recreation of production. Current catalogs, all function ACLs/bodies, provider dashboards, and actual device behavior remain necessary for production sign-off.

## Validation

- Execute `scripts/test-privacy-boundaries.cjs` with `NODE_PATH` pointing to a temporary installation of `@electric-sql/pglite` and the normal repo dependencies installed.
- The tests execute the actual Edge handler source with controlled Auth/Storage/database doubles; reproduce the two old handler failures from the reviewed base; reject foreign/malformed requests with the repaired source; preserve valid own-couple requests.
- Isolated Postgres tests apply the actual new migration and exercise cross-couple reads/writes, forged pairing/activity references, storage isolation, partner media deletion, inactive-couple access, and service-only wipe permissions.
- A separate test deliberately confirms the unresolved soft-delete retention gap.
- TypeScript and Expo web export pass. Lint comparison shows no new errors relative to the unchanged base; existing errors remain.
- No iOS/Android forensic tests or live Supabase tests ran.

## Required next work and deployment

1. Deploy the repaired `copy-to-vault` and `notify-screenshot` Edge Functions. Merging or OTA alone does not change deployed server code.
2. Apply `20261003120043_harden_privacy_boundaries.sql` after reviewing the live policy/privilege state, then run the supplied live verification SQL. No existing customer content is purged by this migration.
3. Publish the app update for session/cache/temp-file hardening. Check two devices and two unrelated couples, plus both actual reviewer logins.
4. Replace all burn paths with a server-authoritative, idempotent burn manifest. Quarantine immediately; inventory every linked byte/payload; delete via Storage API (SQL metadata deletion is insufficient); hard-delete database content; persist retries; verify completion before showing success. Include a server scheduler for timers and a resumable purge for existing tombstones/orphans.
5. Design backup retention, restore-time reapplication of deletion records, and encryption/key lifecycle if stronger irrecoverability is required. Backup ciphertext is only irrecoverable if its decryption keys cannot be restored too; do not promise that deleting an ordinary key row achieves cryptographic erasure.
6. Audit app-owned video/picker/upload caches, background snapshots, device-backup exclusions, and offline behavior on real iOS/Android devices. Define the boundary for exported originals/screenshots and for hardware outside the app's control.

A future acceptance result should name exactly what was tested and the retention/eviction bounds. “No unrelated couple can obtain private content through supported APIs” is testable; “no copy can exist anywhere forever” is not a guarantee this application can honestly make.
