# Onboarding audit — 2026-10-04

Audited main at `a7bd59b295ff797edff636c475726ce41652639c`, including the merge of privacy PR #32 and the subsequent Bolt deployment commit. This is a source and isolated regression audit. Production Supabase denied access to this connection; native Apple/Google, real email delivery, billing and physical-device layouts were not exercised.

## Scope and result

| Surface | Findings and corrected behavior |
| --- | --- |
| Welcome, preview and invite links | Invalid link formats are rejected; inactive history is not considered a current partner; invite intent survives registration/onboarding detours. |
| Email registration | Accounts without an authenticated session go directly to email verification, avoiding an unauthorized avatar upload step. Required signup metadata remains supplied to the existing server trigger. |
| Apple and Google registration | A name alone no longer advances to avatar. DOB/age/Terms completion precedes joining. Provider names populate the completion form. Dates restored from PostgreSQL use local calendar dates rather than UTC dates that can shift a day. Web OAuth API errors are surfaced. |
| Registration validation | Shared checks reject blank names, missing consent/age evidence, impossible dates and under-18 dates. February 31 no longer becomes a valid March DOB. This remains self-declared age verification, not identity verification. |
| Native email callbacks | Returned access/refresh tokens or a PKCE code are exchanged into a session. Auth listener work runs outside the client's auth lock. Verification failures offer retry/sign-in. |
| Password recovery | Reset emails have an explicit callback URL and recovery intent. A new reset screen validates and saves the password, then resumes the normal account checks. Previously the app had no reset screen and no recovery-event routing. |
| Email resend | Uses the same callback redirect as signup. Pending invite errors lead to retry with the code retained rather than an unmanaged delayed navigation. |
| Onboarding persistence | Profile/settings writes must return a saved row; zero-row responses and network errors cannot be claimed as success. Repeated finish taps are blocked. Invite intent survives failures and completion. |
| Pairing and celebrations | Only an accepted join is treated as accepted; legacy pending statuses are not called a successful connection. Active pairing checks prevent inactive history redirects. Completion resumes through normal guards; a returning user does not repeat the onboarding carousel. Celebration is recorded when shown, rather than before navigation. |
| Pairing database | A trigger serializes new pair establishment and rejects accounts already present in another active couple, self-pairing, unverified/incomplete joining accounts, and couples with pending deletion. The join RPC locks the target, accepts only active invitations, consumes the code and resets both celebration flags. |
| Profile completion | Saves require an actual updated row and display failures. Completion follows normal profile/onboarding checks instead of a timer that bypassed them. |
| Startup and reconnect | Both membership lookups must resolve; inactive history cannot outweigh an active couple. Temporary network errors do not erase a saved session. Stale loads cannot restore an old identity's profile/couple/subscription state. |
| Subscription verification | HTTP errors and malformed responses remain unresolved, instead of becoming an authoritative “not premium” result. Retry stops on unresolved verification. Purchasing requires a successful fresh verification; post-purchase navigation goes through normal checks. |
| Permissions and preferences | Boot refreshes only an already-granted push token, without prompting during signup or silently enabling notifications. A new account is prompted after onboarding saves. Logout clears the token while preserving the preference. Photo access remains requested by the avatar picker. Permission denial does not block setup. |
| Direct app navigation | Protected app screens do not render while signed out or with incomplete registration/onboarding. Auth completion screens redirect guests. |
| Carousel layout | Slides scroll vertically when text/visuals exceed the available height, and rotation keeps the current horizontal page aligned. Physical-device/large-text verification remains required. |
| First shared moment | Existing server-persisted milestone is retained. Its regression suite passed for historical backfill, all five send paths, burning, disconnection, partner change and rollback. |
| Clean installs | Repaired missing optional platform entries in the npm lockfile. No existing dependency version changed. `npm ci --dry-run` now validates the lockfile. |

## Verification

- `npm run typecheck`: passed.
- Expo web export with placeholder public Supabase values: passed. This checks bundling, not authentication against a real server.
- `scripts/test-onboarding-flow.cjs`: executes current TypeScript handlers with controlled auth/network responses and the new SQL in isolated PGlite PostgreSQL. Covers required fields/age, native token exchange, recovery routing, preserved invite, retryable join, an existing pair, zero-row writes, unresolved subscription responses, notification preferences, consumed/inactive invites, duplicate pair membership in either column, email/Terms requirements, deletion-in-progress and function permissions.
- `scripts/test-onboarding-regressions.cjs`: passed, including actual first-moment migration and repeated overlapping Realtime subscriptions.
- Existing privacy boundaries, durable burns and worker regression scripts: passed.
- Changed-file ESLint compared with the starting code: no new errors; existing unrelated lint errors remain.
- `git diff --check`: passed.

The database fixture contains the tables/columns needed for these routines. It does not reproduce every production trigger, Auth service or Storage behavior. PGlite executes SQL sequentially; the serialization guard is exercised, but a real multi-connection race/stress test remains a deployment acceptance check. Handler mocks do not substitute for an actual mounted native app or real authentication provider.

## Deployment and live acceptance

1. Merge the PR, then have Bolt sync main and apply `20261004163624_harden_onboarding_pairing.sql`. It depends on the deployed privacy/burn tables. No new Edge Function deployment is required by this PR.
2. Confirm Supabase Auth allows `warmup://auth/callback` and `warmup://auth/callback?recovery=1`, plus the actual web-origin callback equivalents. If the allowlist uses a matching wildcard, verify it covers both. Verify confirmation and reset templates honor the supplied redirect. Do not infer these settings from source code.
3. Run the content-free SQL checks below. Investigate duplicate historical active pairs before rollout. This migration does not silently disconnect existing accounts or rewrite existing profiles.
4. Publish the native/OTA update after the migration and redirect checks. Ensure its environment targets the intended production project.
5. Test two fresh accounts on two devices: email confirmation cold/warm app, Apple first authorization and repeat authorization, Google cancellation/success, valid invite link before and after registration, expired/used/self code, two joining users competing for a code, one user trying two codes concurrently, re-pair after disconnect, trial owner and partner access, expired trial and restore purchase. No competing request may create a second active pairing.
6. Exercise invalid DOB, missing Terms, declined notifications/photo permissions, airplane mode during each save, account switching, forced app quit after each step, reset link cold/warm app and expired/reused reset links. Completed onboarding should not replay on return. No offline failure should force a valid user to purchase again.
7. Inspect a small iPhone, large text, Android keyboard/back button, iPad and rotation. Check that fields, consent links, carousel copy and all buttons remain reachable.
8. Sign in with the actual two Apple review accounts. Confirm their ordinary profile/setup state and the test couple are correct. Source code cannot establish which accounts reviewers were actually given.

```sql
-- Counts only; no names, emails, content, tokens or media URLs.
WITH members AS (
  SELECT user_a_id AS user_id FROM public.couples WHERE active AND user_b_id IS NOT NULL
  UNION ALL
  SELECT user_b_id FROM public.couples WHERE active AND user_b_id IS NOT NULL
)
SELECT count(*) AS accounts_with_multiple_active_pairs
FROM (SELECT user_id FROM members GROUP BY user_id HAVING count(*) > 1) duplicates;

SELECT count(*) AS incomplete_active_joiners
FROM public.couples c
JOIN public.profiles p ON p.id=c.user_b_id
JOIN auth.users u ON u.id=p.id
WHERE c.active AND c.user_b_id IS NOT NULL
AND (u.email_confirmed_at IS NULL OR nullif(trim(p.first_name),'') IS NULL
  OR nullif(trim(p.last_name),'') IS NULL OR p.date_of_birth IS NULL
  OR p.date_of_birth > (current_date - interval '18 years')::date
  OR p.age_verified_at IS NULL OR p.tos_accepted_at IS NULL);

SELECT tgname, tgenabled FROM pg_trigger
WHERE NOT tgisinternal AND tgname IN ('guard_onboarding_pairing','guard_registration_fields');

SELECT
  has_function_privilege('anon','public.request_join(text)','execute') AS anon_can_join,
  has_function_privilege('authenticated','public.guard_onboarding_pairing()','execute') AS client_can_call_pair_guard,
  has_function_privilege('authenticated','public.guard_registration_fields()','execute') AS client_can_call_registration_guard;
-- Expect both triggers enabled and all three privilege booleans false.
```

The source defects listed above are fixed and tested within the stated limits. Production authentication settings, real delivery, provider setup, concurrent database behavior and native usability still require the live acceptance pass.
