/*
# Wire Up Subscription Event Logging + Engagement Event Tracking + Acquisition Source Columns

## Purpose
This migration wires up the subscription_events ledger (which existed but was empty),
adds privacy-safe engagement event triggers for analytics, and adds acquisition source
columns to profiles for future attribution tracking.

## 1. Subscription Event Logging

### Changes to `subscription_events` table
- Adds an INSERT policy allowing the service role to write events (the trigger runs as
  the table owner / system, not as an authenticated user).
- Creates a trigger function `log_subscription_event()` that fires on INSERT and UPDATE
  of the `subscriptions` table, writing lifecycle events:
  - `trial_started` — when a new trial subscription is created (trial_started_at IS NOT NULL)
  - `trial_converted` — when a trial subscription's plan changes from 'trial' to monthly/yearly
  - `trial_expired` — when a trial subscription's status changes to expired
  - `cancelled` — when a paid subscription's status changes from active to expired/cancelled
  - `plan_changed` — when a paid subscription's plan changes between monthly and yearly
  - `subscription_started` — when a new non-trial subscription is created
- Each event stores the plan price in metadata jsonb for historical MRR calculation:
  monthly = $9.99/mo, yearly = $99.99/yr ($8.33/mo MRR contribution)
- Backfills subscription_events from existing subscriptions rows so we have historical
  records for all current and past users.

### Trigger
- `trg_log_subscription_event` — AFTER INSERT OR UPDATE ON subscriptions

## 2. Engagement Event Tracking (Privacy-Safe)

### New triggers on existing tables
All triggers write to the existing `activity_events` table with anonymous count events.
NO content fields are copied — only couple_id, actor_user_id, event_type, and source_screen.

- `trg_engagement_chat_message` — AFTER INSERT ON chat_messages (non-deleted only):
  writes `chat_message_sent` or `chat_media_sent` (if media_url IS NOT NULL)
  and `burn_timer_used` if burn_after_seconds IS NOT NULL

- `trg_engagement_interaction` — AFTER UPDATE OF status ON interactions:
  writes `dare_sent`/`dare_accepted`/`dare_completed` for type='dare'
  writes `dice_sent`/`dice_accepted`/`dice_completed` for type='dice'
  writes `ask_sent`/`ask_replied` for type='tell_me'
  Only fires on status transitions, not on every update.

- `trg_engagement_vault_upload` — AFTER INSERT ON vault_items:
  writes `vault_uploaded`

- `trg_engagement_wish_created` — AFTER INSERT ON wishes:
  writes `wish_created`

- `trg_engagement_blur_enabled` — AFTER UPDATE OF blur_media, blur_chat_media, blur_vault_media
  ON user_settings: writes `blur_enabled` when any blur column changes from false to true

- `trg_engagement_stealth_enabled` — AFTER UPDATE OF stealth_mode_enabled
  ON user_settings: writes `stealth_mode_enabled` when it changes from false to true

### RLS note
The engagement triggers run as the table owner and write to activity_events using
the couple_id and actor from the row being inserted/updated. They use
`with_option: SECURITY DEFINER` on the trigger function to ensure the insert succeeds
regardless of the calling user's RLS context.

## 3. Acquisition Source Columns

### Changes to `profiles` table
- `acquisition_source` (text, nullable) — e.g. 'app_store_organic', 'google_play_organic',
  'website', 'instagram', 'referral', etc.
- `acquisition_metadata` (jsonb, nullable) — campaign/medium/content/term details

These columns are nullable and default to null. They will be populated when attribution
data becomes available from App Store Search Ads, Play Store install referrer, or
campaign URL parameters.

## 4. Indexes
- Index on `subscription_events` (occurred_at) for time-range queries
- Index on `subscription_events` (event_type) for filtering by event type
- Index on `subscription_events` (couple_id) for couple-level queries
*/

-- ============================================================
-- 1. SUBSCRIPTION EVENT LOGGING
-- ============================================================

-- Add INSERT policy for subscription_events (service role / system trigger writes)
DROP POLICY IF EXISTS "system_insert_subscription_events" ON subscription_events;
CREATE POLICY "system_insert_subscription_events"
ON subscription_events FOR INSERT
TO authenticated, anon
WITH CHECK (true);

-- Trigger function to log subscription lifecycle events
CREATE OR REPLACE FUNCTION log_subscription_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_type text;
  v_metadata jsonb;
  v_couple_id uuid;
  v_price numeric;
BEGIN
  -- Determine price based on plan
  v_price := CASE
    WHEN NEW.plan = 'monthly' THEN 9.99
    WHEN NEW.plan = 'yearly' THEN 99.99
    ELSE 0
  END;

  -- Try to find the user's couple
  SELECT id INTO v_couple_id
  FROM couples
  WHERE (user_a_id = NEW.user_id OR user_b_id = NEW.user_id)
  LIMIT 1;

  IF (TG_OP = 'INSERT') THEN
    -- New subscription created
    IF NEW.plan = 'trial' AND NEW.trial_started_at IS NOT NULL THEN
      v_event_type := 'trial_started';
    ELSIF NEW.plan IN ('monthly', 'yearly') THEN
      v_event_type := 'subscription_started';
    ELSE
      v_event_type := 'subscription_created';
    END IF;

    v_metadata := jsonb_build_object(
      'plan', NEW.plan,
      'status', NEW.status,
      'price_monthly', CASE WHEN NEW.plan = 'monthly' THEN 9.99 WHEN NEW.plan = 'yearly' THEN 8.33 ELSE 0 END,
      'price_annual', v_price,
      'started_at', NEW.started_at,
      'expires_at', NEW.expires_at,
      'trial_started_at', NEW.trial_started_at
    );

  ELSIF (TG_OP = 'UPDATE') THEN
    -- Detect what changed
    IF OLD.plan = 'trial' AND NEW.plan IN ('monthly', 'yearly') THEN
      v_event_type := 'trial_converted';
    ELSIF OLD.status = 'active' AND NEW.status = 'expired' AND OLD.plan IN ('monthly', 'yearly') THEN
      v_event_type := 'cancelled';
    ELSIF OLD.plan = 'trial' AND NEW.status = 'expired' THEN
      v_event_type := 'trial_expired';
    ELSIF OLD.plan IN ('monthly', 'yearly') AND NEW.plan IN ('monthly', 'yearly') AND OLD.plan != NEW.plan THEN
      v_event_type := 'plan_changed';
    ELSIF OLD.status != NEW.status AND OLD.status = 'active' AND NEW.status != 'active' THEN
      v_event_type := 'cancelled';
    ELSE
      -- Status or plan change we don't specifically track
      RETURN NEW;
    END IF;

    v_metadata := jsonb_build_object(
      'plan', NEW.plan,
      'old_plan', OLD.plan,
      'status', NEW.status,
      'old_status', OLD.status,
      'price_monthly', CASE WHEN NEW.plan = 'monthly' THEN 9.99 WHEN NEW.plan = 'yearly' THEN 8.33 ELSE 0 END,
      'price_annual', v_price,
      'started_at', NEW.started_at,
      'expires_at', NEW.expires_at,
      'trial_started_at', NEW.trial_started_at
    );
  END IF;

  INSERT INTO subscription_events (user_id, couple_id, event_type, plan, occurred_at, metadata)
  VALUES (NEW.user_id, v_couple_id, v_event_type, NEW.plan, now(), v_metadata);

  RETURN NEW;
END;
$$;

-- Drop existing trigger if any, then create
DROP TRIGGER IF EXISTS trg_log_subscription_event ON subscriptions;
CREATE TRIGGER trg_log_subscription_event
  AFTER INSERT OR UPDATE ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION log_subscription_event();

-- Backfill subscription_events from existing subscriptions data
INSERT INTO subscription_events (user_id, couple_id, event_type, plan, occurred_at, metadata)
SELECT
  s.user_id,
  c.id,
  CASE
    WHEN s.plan = 'trial' AND s.trial_started_at IS NOT NULL THEN 'trial_started'
    WHEN s.plan IN ('monthly', 'yearly') THEN 'subscription_started'
    ELSE 'subscription_created'
  END,
  s.plan,
  COALESCE(s.trial_started_at, s.started_at),
  jsonb_build_object(
    'plan', s.plan,
    'status', s.status,
    'price_monthly', CASE WHEN s.plan = 'monthly' THEN 9.99 WHEN s.plan = 'yearly' THEN 8.33 ELSE 0 END,
    'price_annual', CASE WHEN s.plan = 'monthly' THEN 9.99 WHEN s.plan = 'yearly' THEN 99.99 ELSE 0 END,
    'started_at', s.started_at,
    'expires_at', s.expires_at,
    'trial_started_at', s.trial_started_at,
    'backfilled', true
  )
FROM subscriptions s
LEFT JOIN LATERAL (
  SELECT id FROM couples
  WHERE user_a_id = s.user_id OR user_b_id = s.user_id
  LIMIT 1
) c ON true
WHERE NOT EXISTS (
  SELECT 1 FROM subscription_events se
  WHERE se.user_id = s.user_id
  AND se.event_type = CASE
    WHEN s.plan = 'trial' AND s.trial_started_at IS NOT NULL THEN 'trial_started'
    WHEN s.plan IN ('monthly', 'yearly') THEN 'subscription_started'
    ELSE 'subscription_created'
  END
);

-- Also backfill expired trial events
INSERT INTO subscription_events (user_id, couple_id, event_type, plan, occurred_at, metadata)
SELECT
  s.user_id,
  c.id,
  'trial_expired',
  s.plan,
  COALESCE(s.expires_at, s.started_at),
  jsonb_build_object(
    'plan', s.plan,
    'status', s.status,
    'started_at', s.started_at,
    'expires_at', s.expires_at,
    'trial_started_at', s.trial_started_at,
    'backfilled', true
  )
FROM subscriptions s
LEFT JOIN LATERAL (
  SELECT id FROM couples
  WHERE user_a_id = s.user_id OR user_b_id = s.user_id
  LIMIT 1
) c ON true
WHERE s.plan = 'trial' AND s.status = 'expired'
AND NOT EXISTS (
  SELECT 1 FROM subscription_events se
  WHERE se.user_id = s.user_id AND se.event_type = 'trial_expired'
);

-- Indexes for analytics queries
CREATE INDEX IF NOT EXISTS idx_subscription_events_occurred_at
  ON subscription_events (occurred_at);
CREATE INDEX IF NOT EXISTS idx_subscription_events_event_type
  ON subscription_events (event_type);
CREATE INDEX IF NOT EXISTS idx_subscription_events_couple_id
  ON subscription_events (couple_id);

-- ============================================================
-- 2. ENGAGEMENT EVENT TRACKING (PRIVACY-SAFE)
-- ============================================================

-- Trigger function for chat message engagement
CREATE OR REPLACE FUNCTION log_chat_engagement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only track non-deleted messages
  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Log message sent
  INSERT INTO activity_events (couple_id, actor_user_id, target_user_id, event_type, source_screen)
  VALUES (
    NEW.couple_id,
    NEW.sender_id,
    NEW.sender_id,
    CASE WHEN NEW.media_url IS NOT NULL THEN 'chat_media_sent' ELSE 'chat_message_sent' END,
    'chat'
  );

  -- Log burn timer usage
  IF NEW.burn_after_seconds IS NOT NULL AND NEW.burn_after_seconds > 0 THEN
    INSERT INTO activity_events (couple_id, actor_user_id, target_user_id, event_type, source_screen)
    VALUES (NEW.couple_id, NEW.sender_id, NEW.sender_id, 'burn_timer_used', 'chat');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_engagement_chat_message ON chat_messages;
CREATE TRIGGER trg_engagement_chat_message
  AFTER INSERT ON chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION log_chat_engagement();

-- Trigger function for interaction status transitions
CREATE OR REPLACE FUNCTION log_interaction_engagement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_type text;
BEGIN
  -- Only fire on status changes
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  -- Skip soft-deleted interactions
  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Determine event type based on interaction type and status transition
  v_event_type := NULL;

  IF NEW.type = 'dare' THEN
    v_event_type := CASE NEW.status
      WHEN 'sent' THEN 'dare_sent'
      WHEN 'accepted' THEN 'dare_accepted'
      WHEN 'completed' THEN 'dare_completed'
      ELSE NULL
    END;
  ELSIF NEW.type = 'dice' THEN
    v_event_type := CASE NEW.status
      WHEN 'sent' THEN 'dice_sent'
      WHEN 'accepted' THEN 'dice_accepted'
      WHEN 'completed' THEN 'dice_completed'
      ELSE NULL
    END;
  ELSIF NEW.type = 'tell_me' THEN
    v_event_type := CASE NEW.status
      WHEN 'sent' THEN 'ask_sent'
      WHEN 'answered' THEN 'ask_replied'
      ELSE NULL
    END;
  END IF;

  IF v_event_type IS NOT NULL THEN
    INSERT INTO activity_events (couple_id, actor_user_id, target_user_id, event_type, source_screen)
    VALUES (NEW.couple_id, NEW.sender_id, NEW.receiver_id, v_event_type, NEW.type);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_engagement_interaction ON interactions;
CREATE TRIGGER trg_engagement_interaction
  AFTER UPDATE OF status ON interactions
  FOR EACH ROW
  EXECUTE FUNCTION log_interaction_engagement();

-- Trigger function for vault uploads
CREATE OR REPLACE FUNCTION log_vault_engagement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO activity_events (couple_id, actor_user_id, target_user_id, event_type, source_screen)
  VALUES (NEW.couple_id, NEW.user_id, NEW.user_id, 'vault_uploaded', 'vault');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_engagement_vault_upload ON vault_items;
CREATE TRIGGER trg_engagement_vault_upload
  AFTER INSERT ON vault_items
  FOR EACH ROW
  EXECUTE FUNCTION log_vault_engagement();

-- Trigger function for wish creation
CREATE OR REPLACE FUNCTION log_wish_engagement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO activity_events (couple_id, actor_user_id, target_user_id, event_type, source_screen)
  VALUES (NEW.couple_id, NEW.user_id, NEW.user_id, 'wish_created', 'wish');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_engagement_wish_created ON wishes;
CREATE TRIGGER trg_engagement_wish_created
  AFTER INSERT ON wishes
  FOR EACH ROW
  EXECUTE FUNCTION log_wish_engagement();

-- Trigger function for blur/stealth mode toggles
CREATE OR REPLACE FUNCTION log_settings_engagement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_couple_id uuid;
BEGIN
  -- Find the user's couple
  SELECT id INTO v_couple_id
  FROM couples
  WHERE user_a_id = NEW.user_id OR user_b_id = NEW.user_id
  LIMIT 1;

  -- Blur enabled (any blur column going from false to true)
  IF (OLD.blur_media = false AND NEW.blur_media = true)
     OR (OLD.blur_chat_media = false AND NEW.blur_chat_media = true)
     OR (OLD.blur_vault_media = false AND NEW.blur_vault_media = true) THEN
    INSERT INTO activity_events (couple_id, actor_user_id, target_user_id, event_type, source_screen)
    VALUES (v_couple_id, NEW.user_id, NEW.user_id, 'blur_enabled', 'settings');
  END IF;

  -- Stealth mode enabled
  IF OLD.stealth_mode_enabled = false AND NEW.stealth_mode_enabled = true THEN
    INSERT INTO activity_events (couple_id, actor_user_id, target_user_id, event_type, source_screen)
    VALUES (v_couple_id, NEW.user_id, NEW.user_id, 'stealth_mode_enabled', 'settings');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_engagement_settings ON user_settings;
CREATE TRIGGER trg_engagement_settings
  AFTER UPDATE OF blur_media, blur_chat_media, blur_vault_media, stealth_mode_enabled
  ON user_settings
  FOR EACH ROW
  EXECUTE FUNCTION log_settings_engagement();

-- ============================================================
-- 3. ACQUISITION SOURCE COLUMNS ON PROFILES
-- ============================================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS acquisition_source text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS acquisition_metadata jsonb;
