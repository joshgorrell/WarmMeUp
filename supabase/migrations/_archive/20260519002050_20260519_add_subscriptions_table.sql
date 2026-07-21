/*
  # Add subscriptions table

  ## Summary
  Adds a subscriptions table to track user subscription status for the paywall gate.
  Users with an invite code do not need a subscription (partner's subscription covers them).
  Users who sign up without a code must subscribe before accessing the app.

  ## New Tables
  - `subscriptions`
    - `id` (uuid, PK)
    - `user_id` (uuid, FK to auth.users) — one row per user
    - `plan` (text) — 'trial' | 'monthly' | 'yearly'
    - `status` (text) — 'active' | 'cancelled' | 'expired'
    - `started_at` (timestamptz)
    - `expires_at` (timestamptz, nullable) — null means indefinite/managed externally
    - `created_at` (timestamptz)

  ## Security
  - RLS enabled
  - Users can SELECT their own row
  - INSERT and UPDATE reserved for service role (payment webhooks) — no client-side policies
*/

CREATE TABLE IF NOT EXISTS subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan text NOT NULL CHECK (plan = ANY (ARRAY['trial'::text, 'monthly'::text, 'yearly'::text])),
  status text NOT NULL DEFAULT 'active' CHECK (status = ANY (ARRAY['active'::text, 'cancelled'::text, 'expired'::text])),
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own subscription"
  ON subscriptions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
