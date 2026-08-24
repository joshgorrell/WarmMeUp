/*
  Durable Weekly Streak activity ledger

  Weekly Streak is a relationship-engagement metric, not a content-retention
  feature. Deleting chat, Vault media, Dice/Dare/Wish history, Activity history,
  or resetting Points must not retroactively erase a week that was legitimately
  active at the time.

  This migration stores only the minimum durable fact needed for the streak:
  couple_id + UTC Monday week_start. It stores no message text, media, prompt
  content, game result, exact activity timestamp, or other private content.
*/

CREATE TABLE IF NOT EXISTS public.weekly_activity (
  couple_id uuid NOT NULL REFERENCES public.couples(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  PRIMARY KEY (couple_id, week_start)
);

ALTER TABLE public.weekly_activity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Couple members can view weekly activity" ON public.weekly_activity;
DROP POLICY IF EXISTS "Couple members can read weekly activity" ON public.weekly_activity;
CREATE POLICY "Couple members can read weekly activity"
ON public.weekly_activity
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.couples c
    WHERE c.id = weekly_activity.couple_id
      AND (c.user_a_id = auth.uid() OR c.user_b_id = auth.uid())
  )
);

-- RLS already denies client writes, but revoke them explicitly as defense in depth.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.weekly_activity FROM anon, authenticated;
GRANT SELECT ON public.weekly_activity TO authenticated;

-- Record a qualifying week at insert time so later deletion of the underlying
-- content cannot rewrite streak history. The trigger stores only the week marker.
CREATE OR REPLACE FUNCTION public.record_weekly_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ts timestamptz;
  v_week_start date;
BEGIN
  v_ts := COALESCE(NEW.created_at, now());
  v_week_start := date_trunc('week', v_ts AT TIME ZONE 'UTC')::date;

  INSERT INTO public.weekly_activity (couple_id, week_start)
  VALUES (NEW.couple_id, v_week_start)
  ON CONFLICT (couple_id, week_start) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Trigger functions do not need to be directly callable by app clients.
REVOKE EXECUTE ON FUNCTION public.record_weekly_activity() FROM PUBLIC, anon, authenticated;

-- Remove both early branch trigger names and the deployed names before creating
-- the canonical deployed names. This keeps the migration safe to replay.
DROP TRIGGER IF EXISTS record_weekly_activity_interactions ON public.interactions;
DROP TRIGGER IF EXISTS trg_weekly_activity_interaction ON public.interactions;
CREATE TRIGGER trg_weekly_activity_interaction
AFTER INSERT ON public.interactions
FOR EACH ROW
EXECUTE FUNCTION public.record_weekly_activity();

DROP TRIGGER IF EXISTS record_weekly_activity_chat_messages ON public.chat_messages;
DROP TRIGGER IF EXISTS trg_weekly_activity_chat_message ON public.chat_messages;
CREATE TRIGGER trg_weekly_activity_chat_message
AFTER INSERT ON public.chat_messages
FOR EACH ROW
EXECUTE FUNCTION public.record_weekly_activity();

DROP TRIGGER IF EXISTS record_weekly_activity_vault_items ON public.vault_items;
DROP TRIGGER IF EXISTS trg_weekly_activity_vault_item ON public.vault_items;
CREATE TRIGGER trg_weekly_activity_vault_item
AFTER INSERT ON public.vault_items
FOR EACH ROW
EXECUTE FUNCTION public.record_weekly_activity();

DROP TRIGGER IF EXISTS record_weekly_activity_send_love ON public.activity_events;
DROP TRIGGER IF EXISTS trg_weekly_activity_send_love ON public.activity_events;
CREATE TRIGGER trg_weekly_activity_send_love
AFTER INSERT ON public.activity_events
FOR EACH ROW
WHEN (NEW.event_type = 'send_love')
EXECUTE FUNCTION public.record_weekly_activity();

-- Backfill every qualifying historical week that can still be derived today.
-- After this migration, those week markers survive deletion of the source rows.
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

-- One canonical shared calculation for both partners. p_tz remains only for
-- API compatibility; the couple metric uses UTC Monday boundaries so both
-- partners always receive the same value.
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
  v_current_week date;
  v_has_both_partners boolean;
  v_start_week date;
  v_streak integer := 0;
  v_week date;
  v_found boolean;
BEGIN
  SELECT (active = true AND user_a_id IS NOT NULL AND user_b_id IS NOT NULL)
  INTO v_has_both_partners
  FROM public.couples
  WHERE id = p_couple_id;

  IF COALESCE(v_has_both_partners, false) = false THEN
    RETURN 0;
  END IF;

  v_current_week := date_trunc('week', now() AT TIME ZONE 'UTC')::date;

  -- Current week is a grace period. If the couple has not been active yet this
  -- week, preserve the completed streak through last week until Sunday ends.
  SELECT EXISTS (
    SELECT 1
    FROM public.weekly_activity
    WHERE couple_id = p_couple_id
      AND week_start = v_current_week
  ) INTO v_found;

  IF v_found THEN
    v_start_week := v_current_week;
  ELSE
    v_start_week := v_current_week - 7;
  END IF;

  v_week := v_start_week;
  LOOP
    SELECT EXISTS (
      SELECT 1
      FROM public.weekly_activity
      WHERE couple_id = p_couple_id
        AND week_start = v_week
    ) INTO v_found;

    EXIT WHEN NOT v_found;

    v_streak := v_streak + 1;
    v_week := v_week - 7;
  END LOOP;

  RETURN v_streak;
END;
$$;

REVOKE ALL ON FUNCTION public.get_weekly_streak(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_weekly_streak(uuid, text) TO authenticated;
