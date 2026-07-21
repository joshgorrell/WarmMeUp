/*
# Couple Analytics & Feedback System

1. Purpose
   Adds three new tables to support privacy-first couple analytics:
   - `couple_health_scores` — per-couple health classification (healthy / at_risk / inactive),
     computed by an edge function and stored for quick admin dashboard reads.
   - `cancellation_surveys` — optional feedback collected when a user cancels a
     subscription or lets a trial expire.  All fields except `survey_type` are optional.
   - `subscription_events` — audit log of trial and subscription lifecycle events
     (trial_started, trial_converted, trial_expired, subscription_started,
     subscription_cancelled).

2. New Tables

   **couple_health_scores**
   - `couple_id` (uuid, primary key, references couples.id ON DELETE CASCADE)
   - `status` (text: 'healthy' | 'at_risk' | 'inactive')
   - `computed_at` (timestamptz)
   - `last_activity_at` (timestamptz, nullable)
   - `days_since_activity` (integer, nullable)
   - `partner_a_active` (boolean, default false)
   - `partner_b_active` (boolean, default false)
   - `shared_activity_7d` (integer, default 0)

   **cancellation_surveys**
   - `id` (uuid, primary key)
   - `user_id` (uuid, NOT NULL, DEFAULT auth.uid(), references auth.users ON DELETE CASCADE)
   - `couple_id` (uuid, nullable, references couples.id ON DELETE SET NULL)
   - `survey_type` (text, NOT NULL — 'cancel' | 'trial_expired' | 'declined')
   - `primary_reason` (text, nullable — enum-like: forgot, partner_not_interested, too_expensive, not_enough_value, missing_features, technical_issues, privacy_concerns, broke_up, other)
   - `other_reason_text` (text, nullable)
   - `most_used_feature` (text, nullable)
   - `never_used_feature` (text, nullable)
   - `would_convince_feature` (text, nullable)
   - `would_return` (text, nullable — 'yes' | 'maybe' | 'no')
   - `submitted_at` (timestamptz, default now())

   **subscription_events**
   - `id` (uuid, primary key)
   - `user_id` (uuid, NOT NULL, references auth.users ON DELETE CASCADE)
   - `couple_id` (uuid, nullable, references couples.id ON DELETE SET NULL)
   - `event_type` (text, NOT NULL — 'trial_started' | 'trial_converted' | 'trial_expired' | 'subscription_started' | 'subscription_cancelled')
   - `plan` (text, nullable)
   - `occurred_at` (timestamptz, default now())
   - `metadata` (jsonb, nullable)

3. Security (RLS)

   All three tables have RLS enabled.

   **couple_health_scores** — admin-only read via `is_current_user_admin()`;
   edge functions use the service-role key which bypasses RLS entirely.

   **cancellation_surveys** — authenticated users can INSERT their own rows
   (`auth.uid() = user_id`); admins can SELECT all; users can SELECT their own;
   no UPDATE or DELETE policies (surveys are write-once).

   **subscription_events** — admin-only read via `is_current_user_admin()`;
   edge functions write via service-role key (bypasses RLS);
   no INSERT policy for authenticated users (only edge functions write here).

4. Indexes
   - `couple_health_scores`: on `status` for dashboard filtering
   - `cancellation_surveys`: on `user_id`, on `couple_id`, on `submitted_at`
   - `subscription_events`: on `user_id`, on `couple_id`, on `occurred_at`, on `event_type`

5. Important Notes
   - The `is_current_user_admin()` SECURITY DEFINER helper already exists and is
     used for all admin-scoped RLS policies in this schema.
   - Edge functions that compute analytics use the SUPABASE_SERVICE_ROLE_KEY,
     which bypasses RLS — they do not need authenticated policies.
   - `couple_health_scores` uses a single-row-per-couple upsert pattern
     (primary key = couple_id) so the edge function can `INSERT … ON CONFLICT
     (couple_id) DO UPDATE`.
*/

-- ─── couple_health_scores ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.couple_health_scores (
  couple_id uuid PRIMARY KEY REFERENCES public.couples(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'inactive',
  computed_at timestamptz NOT NULL DEFAULT now(),
  last_activity_at timestamptz,
  days_since_activity integer,
  partner_a_active boolean NOT NULL DEFAULT false,
  partner_b_active boolean NOT NULL DEFAULT false,
  shared_activity_7d integer NOT NULL DEFAULT 0
);

ALTER TABLE public.couple_health_scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_read_couple_health_scores" ON public.couple_health_scores;
CREATE POLICY "admin_read_couple_health_scores"
  ON public.couple_health_scores FOR SELECT
  TO authenticated
  USING (public.is_current_user_admin());

CREATE INDEX IF NOT EXISTS idx_couple_health_scores_status
  ON public.couple_health_scores (status);

-- ─── cancellation_surveys ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.cancellation_surveys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  couple_id uuid REFERENCES public.couples(id) ON DELETE SET NULL,
  survey_type text NOT NULL,
  primary_reason text,
  other_reason_text text,
  most_used_feature text,
  never_used_feature text,
  would_convince_feature text,
  would_return text,
  submitted_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cancellation_surveys ENABLE ROW LEVEL SECURITY;

-- Users can insert their own survey
DROP POLICY IF EXISTS "insert_own_cancellation_survey" ON public.cancellation_surveys;
CREATE POLICY "insert_own_cancellation_survey"
  ON public.cancellation_surveys FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can read their own surveys
DROP POLICY IF EXISTS "select_own_cancellation_surveys" ON public.cancellation_surveys;
CREATE POLICY "select_own_cancellation_surveys"
  ON public.cancellation_surveys FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Admins can read all surveys
DROP POLICY IF EXISTS "admin_read_cancellation_surveys" ON public.cancellation_surveys;
CREATE POLICY "admin_read_cancellation_surveys"
  ON public.cancellation_surveys FOR SELECT
  TO authenticated
  USING (public.is_current_user_admin());

CREATE INDEX IF NOT EXISTS idx_cancellation_surveys_user_id
  ON public.cancellation_surveys (user_id);
CREATE INDEX IF NOT EXISTS idx_cancellation_surveys_couple_id
  ON public.cancellation_surveys (couple_id);
CREATE INDEX IF NOT EXISTS idx_cancellation_surveys_submitted_at
  ON public.cancellation_surveys (submitted_at);

-- ─── subscription_events ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.subscription_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  couple_id uuid REFERENCES public.couples(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  plan text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb
);

ALTER TABLE public.subscription_events ENABLE ROW LEVEL SECURITY;

-- Admins can read all subscription events
DROP POLICY IF EXISTS "admin_read_subscription_events" ON public.subscription_events;
CREATE POLICY "admin_read_subscription_events"
  ON public.subscription_events FOR SELECT
  TO authenticated
  USING (public.is_current_user_admin());

-- Users can read their own subscription events
DROP POLICY IF EXISTS "select_own_subscription_events" ON public.subscription_events;
CREATE POLICY "select_own_subscription_events"
  ON public.subscription_events FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_subscription_events_user_id
  ON public.subscription_events (user_id);
CREATE INDEX IF NOT EXISTS idx_subscription_events_couple_id
  ON public.subscription_events (couple_id);
CREATE INDEX IF NOT EXISTS idx_subscription_events_occurred_at
  ON public.subscription_events (occurred_at);
CREATE INDEX IF NOT EXISTS idx_subscription_events_event_type
  ON public.subscription_events (event_type);
