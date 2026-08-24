/*
# Weekly Streak System — Durable Activity Ledger

## Purpose
Replaces the per-day streak concept with a couple-level **Weekly Streak** that is
durable, timezone-independent (canonical UTC Monday–Sunday weeks), and immune to
private-content deletion.

## What this migration does

### 1. New table: `public.weekly_activity`
- `couple_id uuid` — references `public.couples(id)` with `ON DELETE CASCADE`.
- `week_start date` — the UTC Monday that begins the week.
- Primary key: `(couple_id, week_start)`.
- Stores **only** the fact that the couple had qualifying activity in a given
  week. No message text, media references, interaction content, prompt text,
  game results, or exact timestamps are stored here.

### 2. RLS on `weekly_activity`
- Enabled.
- SELECT-only policy for authenticated users who belong to the couple
  (`couples.user_a_id = auth.uid()` OR `couples.user_b_id = auth.uid()`).
- No INSERT / UPDATE / DELETE policies for authenticated clients — only the
  SECURITY DEFINER trigger function writes rows.

### 3. Trigger function: `public.record_weekly_activity()`
- `SECURITY DEFINER`, `search_path = public, pg_temp`.
- Computes the canonical UTC Monday `week_start` via
  `date_trunc('week', now() AT TIME ZONE 'UTC')::date`.
- Inserts into `weekly_activity` with `ON CONFLICT (couple_id, week_start) DO NOTHING`.

### 4. AFTER INSERT triggers on four tables
- `public.interactions`
- `public.chat_messages`
- `public.vault_items`
- `public.activity_events` — with a `WHEN (NEW.event_type = 'send_love')` clause.

### 5. Backfill
- Inserts distinct `(couple_id, week_start)` rows from all currently retained
  qualifying records (non-deleted interactions, non-deleted chat_messages,
  vault_items, activity_events where event_type = 'send_love').
- Uses `ON CONFLICT DO NOTHING` so it is idempotent.

### 6. `public.get_weekly_streak(p_couple_id uuid, p_tz text DEFAULT 'UTC')`
- Returns `integer`.
- `SECURITY INVOKER`, `search_path = public, pg_temp`.
- Returns 0 if the couple is not active or does not yet have both partners.
- Reads active weeks from `weekly_activity`.
- If the current week already has activity, counts consecutive weeks starting
  with the current week.
- If the current week does not yet have activity, counts consecutive weeks
  starting with last week (grace period).
- Execute granted to `authenticated` only.

### 7. `public.get_day_streak(p_couple_id uuid, p_tz text DEFAULT 'UTC')`
- Replaced to simply return `public.get_weekly_streak(p_couple_id, p_tz)`.
- Same signature preserved for backward compatibility with older app bundles.

### 8. `public.couples.streaks_enabled`
- All existing rows set to `true`.
- Column default ensured to be `true`.
- Column is NOT dropped (kept for compatibility).

## Important notes
1. The ledger is intentionally minimal so that deleting chat, vault, dice,
   dare, wish, or activity history never erases earned streak weeks.
2. UTC week boundaries guarantee both partners always see the same streak
   regardless of their phone timezone.
3. The current week is a grace period: a couple with a 6-week streak through
   last week still shows 6 until the week ends, even with no activity yet this
   week. If they use the app during the week it becomes 7. If the full week
   ends with no activity, the streak breaks.
*/

-- =========================================================
-- 1. Create weekly_activity table
-- =========================================================

CREATE TABLE IF NOT EXISTS public.weekly_activity (
  couple_id uuid NOT NULL REFERENCES public.couples(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  PRIMARY KEY (couple_id, week_start)
);

ALTER TABLE public.weekly_activity ENABLE ROW LEVEL SECURITY;

-- SELECT-only policy for couple members
DROP POLICY IF EXISTS "Couple members can read weekly activity" ON public.weekly_activity;
CREATE POLICY "Couple members can read weekly activity"
ON public.weekly_activity FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.couples c
    WHERE c.id = weekly_activity.couple_id
      AND (c.user_a_id = auth.uid() OR c.user_b_id = auth.uid())
  )
);

-- Grant SELECT to authenticated (no INSERT/UPDATE/DELETE grants)
GRANT SELECT ON public.weekly_activity TO authenticated;

-- =========================================================
-- 2. SECURITY DEFINER trigger function
-- =========================================================

CREATE OR REPLACE FUNCTION public.record_weekly_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_week_start date;
BEGIN
  -- Canonical UTC Monday week start
  v_week_start := date_trunc('week', now() AT TIME ZONE 'UTC')::date;

  INSERT INTO public.weekly_activity (couple_id, week_start)
  VALUES (NEW.couple_id, v_week_start)
  ON CONFLICT (couple_id, week_start) DO NOTHING;

  RETURN NEW;
END;
$$;

-- =========================================================
-- 3. AFTER INSERT triggers on four tables
-- =========================================================

-- interactions
DROP TRIGGER IF EXISTS trg_weekly_activity_interaction ON public.interactions;
CREATE TRIGGER trg_weekly_activity_interaction
AFTER INSERT ON public.interactions
FOR EACH ROW EXECUTE FUNCTION public.record_weekly_activity();

-- chat_messages
DROP TRIGGER IF EXISTS trg_weekly_activity_chat_message ON public.chat_messages;
CREATE TRIGGER trg_weekly_activity_chat_message
AFTER INSERT ON public.chat_messages
FOR EACH ROW EXECUTE FUNCTION public.record_weekly_activity();

-- vault_items
DROP TRIGGER IF EXISTS trg_weekly_activity_vault_item ON public.vault_items;
CREATE TRIGGER trg_weekly_activity_vault_item
AFTER INSERT ON public.vault_items
FOR EACH ROW EXECUTE FUNCTION public.record_weekly_activity();

-- activity_events (only send_love)
DROP TRIGGER IF EXISTS trg_weekly_activity_send_love ON public.activity_events;
CREATE TRIGGER trg_weekly_activity_send_love
AFTER INSERT ON public.activity_events
FOR EACH ROW
WHEN (NEW.event_type = 'send_love')
EXECUTE FUNCTION public.record_weekly_activity();

-- =========================================================
-- 4. Backfill historical activity
-- =========================================================

INSERT INTO public.weekly_activity (couple_id, week_start)
SELECT couple_id, date_trunc('week', created_at AT TIME ZONE 'UTC')::date AS week_start
FROM public.interactions
WHERE deleted_at IS NULL
ON CONFLICT (couple_id, week_start) DO NOTHING;

INSERT INTO public.weekly_activity (couple_id, week_start)
SELECT couple_id, date_trunc('week', created_at AT TIME ZONE 'UTC')::date AS week_start
FROM public.chat_messages
WHERE deleted_at IS NULL
ON CONFLICT (couple_id, week_start) DO NOTHING;

INSERT INTO public.weekly_activity (couple_id, week_start)
SELECT couple_id, date_trunc('week', created_at AT TIME ZONE 'UTC')::date AS week_start
FROM public.vault_items
WHERE deleted_at IS NULL
ON CONFLICT (couple_id, week_start) DO NOTHING;

INSERT INTO public.weekly_activity (couple_id, week_start)
SELECT couple_id, date_trunc('week', created_at AT TIME ZONE 'UTC')::date AS week_start
FROM public.activity_events
WHERE event_type = 'send_love'
ON CONFLICT (couple_id, week_start) DO NOTHING;

-- =========================================================
-- 5. get_weekly_streak function
-- =========================================================

CREATE OR REPLACE FUNCTION public.get_weekly_streak(p_couple_id uuid, p_tz text DEFAULT 'UTC')
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_current_week date;
  v_has_both_partners boolean;
  v_start_week date;
  v_streak integer := 0;
  v_week date;
  v_found boolean;
BEGIN
  -- Check couple exists and has both partners
  SELECT (user_b_id IS NOT NULL AND user_a_id IS NOT NULL)
  INTO v_has_both_partners
  FROM public.couples
  WHERE id = p_couple_id;

  IF NOT v_has_both_partners THEN
    RETURN 0;
  END IF;

  -- Canonical UTC Monday of current week
  v_current_week := date_trunc('week', now() AT TIME ZONE 'UTC')::date;

  -- Determine starting week: current week if active, otherwise last week (grace period)
  SELECT EXISTS (
    SELECT 1 FROM public.weekly_activity
    WHERE couple_id = p_couple_id AND week_start = v_current_week
  ) INTO v_found;

  IF v_found THEN
    v_start_week := v_current_week;
  ELSE
    v_start_week := v_current_week - 7;
  END IF;

  -- Count consecutive active weeks going backwards
  v_week := v_start_week;
  LOOP
    SELECT EXISTS (
      SELECT 1 FROM public.weekly_activity
      WHERE couple_id = p_couple_id AND week_start = v_week
    ) INTO v_found;

    EXIT WHEN NOT v_found;

    v_streak := v_streak + 1;
    v_week := v_week - 7;
  END LOOP;

  RETURN v_streak;
END;
$$;

-- Grant execute to authenticated only
REVOKE ALL ON FUNCTION public.get_weekly_streak(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_weekly_streak(uuid, text) TO authenticated;

-- =========================================================
-- 6. Replace get_day_streak to delegate to get_weekly_streak
-- =========================================================

CREATE OR REPLACE FUNCTION public.get_day_streak(p_couple_id uuid, p_tz text DEFAULT 'UTC')
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN public.get_weekly_streak(p_couple_id, p_tz);
END;
$$;

-- Preserve execute grant for authenticated
REVOKE ALL ON FUNCTION public.get_day_streak(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_day_streak(uuid, text) TO authenticated;

-- =========================================================
-- 7. Ensure all couples.streaks_enabled = true and default is true
-- =========================================================

UPDATE public.couples SET streaks_enabled = true WHERE streaks_enabled = false;

ALTER TABLE public.couples ALTER COLUMN streaks_enabled SET DEFAULT true;
