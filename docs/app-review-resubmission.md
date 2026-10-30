# App Review resubmission: 1.7.0 (111)

## Changes in this branch
- Confirm valid RevenueCat sandbox purchases and label them as sandbox.
- Re-verify sandbox subscriptions through RevenueCat for self and partner access;
  do not trust historical sandbox backfills as purchase evidence.
- Preserve Apple first-authorization names for registration, validate a session
  was returned, and suppress background lock redirects during OAuth.
- Record safe Apple auth stage/error codes; do not log Apple name, email or tokens.
- Bound the optional collision request and reset its sign-out marker reliably.

The Apple login failure has not been reproduced on a physical device. These are
hardening changes, not a verified root-cause diagnosis.

## Deployment
Deploy both `confirm-subscription` and `get-effective-subscription` together.
No schema migration is required. Verify the RevenueCat secret and premium
entitlement configuration in the deployed backend. Client changes require a new
production iOS build; verify its actual EAS build number is newer than 111
(remote versioning is enabled, so app.json is not the authoritative build number).

## Review accounts: not yet verified
The owner supplied test3@ksav.com and test4@ksav.com as an existing paired couple.
This workspace has no authorized connection to the Bolt-managed live database.
Run scripts/verify-app-review-accounts.sql in its SQL editor (read-only).
Do not reset passwords, unpair users or change access just to inspect them.
A stored password only establishes that email/password auth is configured; actual
credential validity must be tested separately without placing passwords in logs.

For purchase review, both users must lack active own/partner premium, admin or
permanent review grants. An expired app trial is not proof of an expired StoreKit
subscription. Verify RevenueCat purchase history as well, and account for the
24-hour app-trial grace period. Preserve the pairing and content. If a full-access
review account is supplied too, label its purpose separately in App Review notes.

## Required release-device checks
On physical iPad and iPhone using the release build:
- Fresh Apple authorization with real and Hide My Email addresses.
- Returning authorization with no name returned, cancellation and retry.
- Existing-email collision and slow/failed networking: clear error, no silent loop.
- Complete name, DOB, Terms and onboarding; relaunch and confirm session persists.
- Expired paired review users reach the paywall without an access override.
- Monthly and annual sandbox purchase, restore, expiry, partner access and relaunch.
- Both product prices come from StoreKit; purchase cancellation remains usable.

Validate the Apple provider's native audience accepts app.warmmeup, the submitted
binary contains Sign in with Apple capability, and both subscriptions are included
in the submission. Enter working app credentials and exact paywall navigation in
App Review Information. Reply to Apple only after these checks pass, listing the
actual tested build and devices. Do not claim device tests were completed here.
