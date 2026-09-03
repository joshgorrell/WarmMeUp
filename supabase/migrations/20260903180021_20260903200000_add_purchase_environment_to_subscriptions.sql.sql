/*
# Add purchase_environment to subscriptions table

## Purpose
Distinguishes TestFlight/sandbox purchases from real production App Store purchases.
This prevents sandbox entitlements from masquerading as legitimate paid subscriptions
when users transition from TestFlight to the production App Store build.

## Changes
1. New Column
   - `subscriptions.purchase_environment` (text, nullable)
     - Values: 'sandbox', 'production', or NULL
     - Check constraint enforces only these values

2. Backfill
   - All existing subscription rows are set to `purchase_environment = 'sandbox'`
     because every existing row was created during TestFlight testing.
     This is the safe default — it means existing TestFlight users will NOT
     be treated as production paid subscribers after this migration deploys.
     They will still have full app access during TestFlight via the local
     RevenueCat SDK fallback in the client, but when they install the
     production App Store build, the server will correctly deny premium
     and show them the paywall.

3. Security
   - No RLS policy changes needed. The service role already has full
     insert/update access on the subscriptions table. The new column
     is only written by edge functions using the service role key.

## Important Notes
1. This migration does NOT delete or modify any user content data.
   All chat history, vault media, dares, dice, wishes, points, streaks,
   settings, profiles, and pairings remain completely untouched.
2. Existing TestFlight users will retain full app access during TestFlight
   via the client-side RevenueCat SDK fallback.
3. When existing TestFlight users install the production App Store build,
   the server will return isPremium=false for their sandbox entitlement,
   and they will see the subscription paywall to make a real purchase.
4. Trial rows (plan='trial') are unaffected by this change — the
   purchase_environment column only applies to paid plan rows
   (plan='monthly' or plan='yearly').
*/

-- Add the purchase_environment column
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS purchase_environment text;

-- Add check constraint for valid values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'subscriptions_purchase_environment_check'
  ) THEN
    ALTER TABLE subscriptions
      ADD CONSTRAINT subscriptions_purchase_environment_check
      CHECK (purchase_environment IS NULL OR purchase_environment IN ('sandbox', 'production'));
  END IF;
END $$;

-- Backfill all existing rows to 'sandbox' since they were all created during TestFlight
UPDATE subscriptions
  SET purchase_environment = 'sandbox'
  WHERE purchase_environment IS NULL;