# RevenueCat Launch Checklist

Run every item against a production sandbox build before submitting to the App Store / Play Store.

---

## Pre-flight Setup

- [ ] `EXPO_PUBLIC_REVENUECAT_IOS_KEY` is set in EAS build secrets (not `.env`)
- [ ] `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` is set in EAS build secrets
- [ ] `REVENUECAT_SECRET_KEY` is set as a Supabase Edge Function secret
- [ ] `EXPO_PUBLIC_RC_IOS_MONTHLY_ID` matches the product ID in App Store Connect
- [ ] `EXPO_PUBLIC_RC_IOS_ANNUAL_ID` matches the product ID in App Store Connect
- [ ] `EXPO_PUBLIC_RC_ANDROID_MONTHLY_ID` matches the product ID in Google Play Console
- [ ] `EXPO_PUBLIC_RC_ANDROID_ANNUAL_ID` matches the product ID in Google Play Console
- [ ] RevenueCat "premium" entitlement exists and both products are attached to it
- [ ] `confirm-subscription` edge function is deployed with latest build

---

## Purchase Flow

### Monthly purchase
- [ ] Tap Subscribe with Monthly selected
- [ ] Complete sandbox purchase
- [ ] App routes to `/(app)/(tabs)` — not back to paywall
- [ ] `subscriptions` table row shows `plan=monthly` and `status=active`
- [ ] `get-effective-subscription` returns `isPremium=true, source=self`

### Annual purchase
- [ ] Tap Subscribe with Yearly selected
- [ ] Complete sandbox purchase
- [ ] App routes to `/(app)/(tabs)`
- [ ] `subscriptions` table row shows `plan=yearly` and `status=active`
- [ ] `get-effective-subscription` returns `isPremium=true, source=self`

---

## Restore Purchases

### Restore after reinstall
- [ ] Install fresh build (no prior subscription row in Supabase)
- [ ] Tap Restore Purchase on paywall
- [ ] RevenueCat finds prior sandbox purchase
- [ ] `confirm-subscription` is called and Supabase row is written
- [ ] App routes to `/(app)/(tabs)`

### Restore with no prior purchase
- [ ] Tap Restore Purchase on account that has never purchased
- [ ] Alert shows "No Purchases Found"
- [ ] App stays on paywall

---

## Subscription Expiry / Cancellation

### Cancelled subscription locks access
- [ ] Cancel subscription in sandbox settings
- [ ] Wait for sandbox period to expire (or fast-forward)
- [ ] Force-close and reopen app
- [ ] `get-effective-subscription` returns `isPremium=false`
- [ ] App redirects to paywall

### Expired subscription locks access
- [ ] Same as above — expired, not cancelled
- [ ] Both should produce identical paywall routing

---

## Partner Access

### Paid User A invites User B
- [ ] User A has active premium
- [ ] User A generates invite code and shares with User B
- [ ] User B joins using the invite code
- [ ] `get-effective-subscription` for User B returns `isPremium=true, source=partner`
- [ ] User B reaches `/(app)/(tabs)` without purchasing

### User B cannot invite a third user
- [ ] User B (partner access, `canInvite=false`) opens the pair screen
- [ ] No invite code is generated / invite flow is blocked
- [ ] `generate_invite_code` RPC refuses if already paired

### User B restore purchase not required
- [ ] User B reinstalls the app
- [ ] No RevenueCat purchase exists for User B
- [ ] App checks `get-effective-subscription`, finds partner access
- [ ] User B enters the app without being prompted to purchase or restore

### User A expires — both lose access
- [ ] User A's subscription expires or is cancelled (sandbox)
- [ ] User A force-closes and reopens — routed to paywall
- [ ] User B force-closes and reopens — `get-effective-subscription` returns `isPremium=false`
- [ ] User B is also routed to paywall

---

## Paywall Guard

### Missing RevenueCat SDK key keeps paywall locked
- [ ] Build with `EXPO_PUBLIC_REVENUECAT_IOS_KEY` unset
- [ ] Open subscription screen
- [ ] Subscribe CTA is disabled or shows "Unavailable"
- [ ] Console shows `[RevenueCat] Missing API key for platform "ios"`
- [ ] App does not route to `/(app)/(tabs)` after tapping Subscribe

### Offering unavailable keeps paywall locked
- [ ] Simulate getOfferings() returning no current offering (e.g. wrong offering ID in RC dashboard)
- [ ] Subscribe CTA is disabled
- [ ] Console shows `[Subscription] no current offering returned from RevenueCat`
- [ ] Tapping Subscribe shows "This plan is currently unavailable"

---

## Transition Screen Safety

### Subscription loading — no bypass
- [ ] Slow network: subscription check takes >400ms
- [ ] App waits and shows loading splash; does not route to `/(app)/(tabs)` prematurely
- [ ] Hard deadline (1000ms) fires → routes to paywall if subscription not confirmed

### Hard deadline with active couple
- [ ] Hard deadline fires with `couple.active=true` but subscription not loaded
- [ ] App routes to `/(app)/(tabs)` only (couple already confirmed active)

---

## Debug Logging Checklist

Verify these log lines appear in Xcode / Logcat during a test purchase:

- `[RevenueCat] Configured for platform "ios"`
- `[RevenueCat] logIn userId=<uuid> created=...`
- `[Subscription] offerings loaded, current: <offering_id>`
- `[Subscription] package found: <product_id>`
- `[Subscription] mapped packages — monthly: true yearly: true`
- `[Subscription] purchasing package: <product_id>`
- `[Subscription] purchase result — premium entitlement active: true`
- `[Subscription] confirm-subscription response: 200`
- `[confirm-subscription] RC premium ACTIVE user=<uuid> plan=... expiresAt=...`
- `[useSubscription] effective subscription: {"isPremium":true,"source":"self","plan":"monthly"}`

None of these logs should contain receipts, tokens, raw `customerInfo` objects, or payment card data.
