/*
  Durable Weekly Streak activity ledger

  Weekly Streak is a relationship-engagement metric, not a content-retention
  feature. Deleting chat, Vault media, Dice/Dare/Wish history, Activity history,
  or resetting Points must not retroactively erase a week that was legitimately
  active at the time.

  This migration therefore stores only the minimum durable fact needed for the
  streak: couple_id + UTC Monday week_start. It stores no message text, media,
  prompt content, game result, exact activity timestamp, or other private content.
*/

CREATE TABLE IF NOT EXISTS public.weekly_activity (
  couple_id uuid NOT NULL REFERENCES public.couples(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  PRIMARY KEY (couple_id, week_start)
);

ALTER TABLE public.weekly_activity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Couple members can view weekly activity" ON public.weekly_activity;
CREATE POLICY "Couple members can view weekly activity"
ON public.weekly_activity
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.couples c
    WHERE c.id = weekly_activity.couple_id
      AND auth.uid() IN (c.user_a_id, c.user_b_id)
  )
);

REVOKE ALL ON TABLE public.weekly_activity FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.weekly_activity FROM authenticated;
GRANT SELECT ON TABLE public.weekly_activity TO authenticated;

-- Record a qualifying week at insert time so later deletion of the underlying
-- content cannot rewrite streak history. The trigger stores only the week marker.
CREATE OR REPLACE FUNCTION public.record_weekly_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_week_start date;
BEGIN
  v_week_start := date_trunc('week', NEW.created_at AT TIME ZONE 'UTC')::date;

  INSERT INTO public.weekly_activity (couple_id, week_start)
  VALUES (NEW.couple_id, v_week_start)
  ON CONFLICT (couple_id, week_start) DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.record_weekly_activity() FROM PUBLIC;

DROP TRIGGER IF EXISTS record_weekly_activity_interactions ON public.interactions;
CREATE TRIGGER record_weekly_activity_interactions
AFTER INSERT ON public.interactions
FOR EACH ROW
EXECUTE FUNCTION public.record_weekly_activity();

DROP TRIGGER IF EXISTS record_weekly_activity_chat_messages ON public.chat_messages;
CREATE TRIGGER record_weekly_activity_chat_messages
AFTER INSERT ON public.chat_messages
FOR EACH ROW
EXECUTE FUNCTION public.record_weekly_activity();

DROP TRIGGER IF EXISTS record_weekly_activity_vault_items ON public.vault_items;
CREATE TRIGGER record_weekly_activity_vault_items
AFTER INSERT ON public.vault_items
FOR EACH ROW
EXECUTE FUNCTION public.record_weekly_activity();

-- Only Send Love activity_events qualify. The WHEN clause keeps unrelated
-- activity-feed events from affecting the streak and lets the shared trigger
-- function remain safe for tables that do not have an event_type column.
DROP TRIGGER IF EXISTS record_weekly_activity_send_love ON public.activity_events;
CREATE TRIGGER record_weekly_activity_send_love
AFTER INSERT ON public.activity_events
FOR EACH ROW
WHEN (NEW.event_type = 'send_love')
EXECUTE FUNCTION public.record_weekly_activity();

-- Backfill every qualifying historical week that can still be derived today.
-- After this migration, those week markers survive deletion of the source rows.
INSERT INTO public.weekly_activity (couple_id, week_start)
SELECT DISTINCT
       couple_id,
       date_trunc('week', created_at AT TIME ZONE 'UTC')::date AS week_start
FROM (
  SELECT couple_id, created_at
  FROM public.interactions
  WHERE deleted_at IS NULL

  UNION ALL

  SELECT couple_id, created_at
  FROM public.chat_messages
  WHERE deleted_at IS NULL

  UNION ALL

  SELECT couple_id, created_at
  FROM public.vault_items
  WHERE deleted_at IS NULL

  UNION ALL

  SELECT couple_id, created_at
  FROM public.activity_events
  WHERE event_type = 'send_love'
) activity
ON CONFLICT (couple_id, week_start) DO NOTHING;

-- One canonical shared calculation for both partners. p_tz remains only for
-- API compatibility with older JS bundles; the couple metric uses UTC Monday
-- boundaries so both partners always receive the same value.
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
    SELECT 1
    FROM public.couples
    WHERE id = p_couple_id
      AND active = true
      AND user_b_id IS NOT NULL
  ) THEN
    RETURN 0;
  END IF;

  SELECT COALESCE(array_agg(week_start), ARRAY[]::date[])
  INTO v_active_weeks
  FROM public.weekly_activity
  WHERE couple_id = p_couple_id;

  IF COALESCE(array_length(v_active_weeks, 1), 0) = 0 THEN
    RETURN 0;
  END IF;

  -- Current week is a grace period. Until Sunday ends, a couple retains the
  -- completed streak through last week. Once this week has activity, include it.
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
