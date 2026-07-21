/*
  # Subscription Trial Auto-Start

  ## Summary
  Automatically creates a 7-day free trial subscription row for every new user
  when their profile is created. This replaces the previous "no subscription = no access"
  model with "every user gets a trial, then must pay."

  Also adds a service-role INSERT/UPDATE policy on subscriptions so the
  confirm-subscription edge function can upsert rows after RevenueCat confirms payment.

  ## Changes

  ### Modified Tables
  - `subscriptions`
    - Adds a `trial_started_at` column (timestamptz) to track when the trial began
    - Adds a service-role upsert policy

  ### New Triggers
  - `on_profile_created` on `public.profiles`
    - Fires AFTER INSERT
    - Inserts a trial subscription row for the new user (idempotent — does nothing if row exists)

  ## Security
  - New policy: service role can INSERT and UPDATE subscriptions (for payment confirmation)
  - Existing SELECT policy for authenticated users is unchanged
*/

-- Add trial_started_at column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subscriptions' AND column_name = 'trial_started_at'
  ) THEN
    ALTER TABLE subscriptions ADD COLUMN trial_started_at timestamptz;
  END IF;
END $$;

-- Allow service role to upsert subscriptions (for RevenueCat confirmation edge function)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'subscriptions' AND policyname = 'Service role can upsert subscriptions'
  ) THEN
    CREATE POLICY "Service role can upsert subscriptions"
      ON subscriptions
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Function that inserts a trial subscription row when a new profile is created
CREATE OR REPLACE FUNCTION public.handle_new_profile_subscription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.subscriptions (user_id, plan, status, trial_started_at, started_at, expires_at)
  VALUES (
    NEW.id,
    'trial',
    'active',
    now(),
    now(),
    now() + interval '7 days'
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Trigger: fire after every new profile row
DROP TRIGGER IF EXISTS on_profile_created ON public.profiles;
CREATE TRIGGER on_profile_created
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_profile_subscription();

-- Back-fill: create trial rows for existing users who have no subscription yet.
-- Sets expires_at to created_at + 7 days so old accounts that never had a trial
-- are considered expired (they'll see the paywall and need to subscribe).
INSERT INTO public.subscriptions (user_id, plan, status, trial_started_at, started_at, expires_at)
SELECT
  p.id,
  'trial',
  'active',
  p.created_at,
  p.created_at,
  p.created_at + interval '7 days'
FROM public.profiles p
WHERE NOT EXISTS (
  SELECT 1 FROM public.subscriptions s WHERE s.user_id = p.id
);
