/*
# Weekly Streak Hardening — Final Correctness Fixes

## Changes

### 1. record_weekly_activity() now uses the activity timestamp
- Replaces `now()` with `NEW.created_at` so the week is derived from when the
  activity actually happened, not when the trigger fires on the DB clock.
- Formula: `date_trunc('week', NEW.created_at AT TIME ZONE 'UTC')::date`
- Still inserts only (couple_id, week_start) with ON CONFLICT DO NOTHING.

### 2. get_weekly_streak() requires an active paired couple
- Checks: couple exists, active = true, user_a_id IS NOT NULL, user_b_id IS NOT NULL.
- Returns 0 if any condition fails.
- Grace-period logic unchanged.

### 3. Hardened privileges (defense in depth)
- REVOKE INSERT, UPDATE, DELETE, TRUNCATE on weekly_activity FROM anon, authenticated.
- REVOKE EXECUTE on record_weekly_activity() FROM PUBLIC, anon, authenticated.
- SELECT remains granted to authenticated.
- service_role / postgres privileges untouched.
- Triggers still invoke the SECURITY DEFINER function normally.
*/

-- =========================================================
-- 1. Replace record_weekly_activity to use NEW.created_at
-- =========================================================

CREATE OR REPLACE FUNCTION public.record_weekly_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_week_start date;
  v_ts timestamptz;
BEGIN
  v_ts := COALESCE(NEW.created_at, now());
  v_week_start := date_trunc('week', v_ts AT TIME ZONE 'UTC')::date;

  INSERT INTO public.weekly_activity (couple_id, week_start)
  VALUES (NEW.couple_id, v_week_start)
  ON CONFLICT (couple_id, week_start) DO NOTHING;

  RETURN NEW;
END;
$$;

-- =========================================================
-- 2. get_weekly_streak requires active paired couple
-- =========================================================

CREATE OR REPLACE FUNCTION public.get_weekly_streak(p_couple_id uuid, p_tz text DEFAULT 'UTC')
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_current_week date;
  v_is_valid boolean;
  v_start_week date;
  v_streak integer := 0;
  v_week date;
  v_found boolean;
BEGIN
  -- Verify couple exists, is active, and has both partners
  SELECT (id IS NOT NULL AND active = true AND user_a_id IS NOT NULL AND user_b_id IS NOT NULL)
  INTO v_is_valid
  FROM public.couples
  WHERE id = p_couple_id;

  IF NOT v_is_valid THEN
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

-- Re-grant execute to authenticated (CREATE OR REPLACE resets grants)
REVOKE ALL ON FUNCTION public.get_weekly_streak(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_weekly_streak(uuid, text) TO authenticated;

-- =========================================================
-- 3. Harden privileges on weekly_activity and trigger function
-- =========================================================

-- Revoke client write privileges (defense in depth; RLS already blocks these)
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.weekly_activity FROM anon, authenticated;

-- Keep SELECT granted to authenticated
GRANT SELECT ON public.weekly_activity TO authenticated;

-- Revoke direct execution of trigger function from all normal clients
REVOKE EXECUTE ON FUNCTION public.record_weekly_activity() FROM PUBLIC, anon, authenticated;
