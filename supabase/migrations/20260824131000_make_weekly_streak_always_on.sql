/*
  Weekly streak is now a core couple metric rather than an optional setting.

  Keep the legacy get_day_streak RPC temporarily as a compatibility bridge so
  older JS bundles and screens receive the new weekly value while the UI cleanup
  rolls through. New code should call get_weekly_streak directly.
*/

UPDATE public.couples
SET streaks_enabled = true
WHERE streaks_enabled IS DISTINCT FROM true;

ALTER TABLE public.couples
  ALTER COLUMN streaks_enabled SET DEFAULT true;

CREATE OR REPLACE FUNCTION public.get_day_streak(
  p_couple_id uuid,
  p_tz text DEFAULT 'UTC'
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN public.get_weekly_streak(p_couple_id, p_tz);
END;
$$;

REVOKE ALL ON FUNCTION public.get_day_streak(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_day_streak(uuid, text) TO authenticated;
