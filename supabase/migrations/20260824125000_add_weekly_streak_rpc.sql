/*
  Weekly couple streak

  A week is Monday-Sunday using one canonical UTC boundary for the couple so both
  partners always see the exact same streak, even if they are in different time zones.
  The p_tz argument is retained for backward-compatible RPC calls but is intentionally
  not used in the calculation.

  Any meaningful couple activity counts: a non-deleted interaction, a non-deleted
  chat message, a vault media item, or Send Love. Opening the app alone does not count.

  Grace behavior: if the current week has no activity yet, the completed streak
  through last week is preserved until the current week ends. If the current week
  is active, it is included in the streak.
*/
CREATE OR REPLACE FUNCTION public.get_weekly_streak(
  p_couple_id uuid,
  p_tz text DEFAULT 'UTC'
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_current_week date := date_trunc('week', now() AT TIME ZONE 'UTC')::date;
  v_start_week date;
  v_cursor date;
  v_count integer := 0;
  v_active_weeks date[];
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM couples
    WHERE id = p_couple_id
      AND active = true
      AND user_b_id IS NOT NULL
  ) THEN
    RETURN 0;
  END IF;

  SELECT ARRAY(
    SELECT DISTINCT week_start
    FROM (
      SELECT date_trunc('week', created_at AT TIME ZONE 'UTC')::date AS week_start
      FROM interactions
      WHERE couple_id = p_couple_id AND deleted_at IS NULL
      UNION
      SELECT date_trunc('week', created_at AT TIME ZONE 'UTC')::date AS week_start
      FROM chat_messages
      WHERE couple_id = p_couple_id AND deleted_at IS NULL
      UNION
      SELECT date_trunc('week', created_at AT TIME ZONE 'UTC')::date AS week_start
      FROM vault_items
      WHERE couple_id = p_couple_id AND deleted_at IS NULL
      UNION
      -- Send Love has its own durable activity event. Do not derive this from
      -- point_events because Reset Points intentionally deletes point history
      -- and must never alter the couple's Weekly Streak.
      SELECT date_trunc('week', created_at AT TIME ZONE 'UTC')::date AS week_start
      FROM activity_events
      WHERE couple_id = p_couple_id AND event_type = 'send_love'
    ) activity
  ) INTO v_active_weeks;

  IF COALESCE(array_length(v_active_weeks, 1), 0) = 0 THEN
    RETURN 0;
  END IF;

  -- Include this week when already active; otherwise preserve the streak that
  -- ended last week until this Monday-Sunday week has had a chance to be used.
  IF v_current_week = ANY(v_active_weeks) THEN
    v_start_week := v_current_week;
  ELSE
    v_start_week := v_current_week - 7;
  END IF;

  v_cursor := v_start_week;
  WHILE v_cursor = ANY(v_active_weeks) LOOP
    v_count := v_count + 1;
    v_cursor := v_cursor - 7;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.get_weekly_streak(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_weekly_streak(uuid, text) TO authenticated;
