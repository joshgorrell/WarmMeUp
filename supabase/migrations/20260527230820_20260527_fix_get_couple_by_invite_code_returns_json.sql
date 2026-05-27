/*
  # Fix get_couple_by_invite_code — return JSON with explicit columns

  ## Problem
  The function was declared as RETURNS couples (the full composite row type).
  PostgREST must resolve that composite type against its schema cache on every
  request. When the cache was stale (missing invite_code_expires_at), any RPC
  PostgREST associated with the couples composite type would fail with PGRST204.

  ## Fix
  Rewrite to RETURNS json with an explicit SELECT of only the 9 columns the app
  actually uses. This fully decouples PostgREST's schema cache resolution from
  the couples composite type — future column additions will never break this RPC.

  ## Changes
  - Drops and recreates public.get_couple_by_invite_code(code text)
    - Returns json instead of couples
    - Selects only: id, user_a_id, user_b_id, active, invite_code,
      invite_code_expires_at, subscription_owner_id, points_enabled,
      streaks_enabled
    - SECURITY DEFINER, STABLE, search_path = public (unchanged)
  - Re-grants EXECUTE to authenticated
  - Fires NOTIFY pgrst, 'reload schema' to flush PostgREST cache

  ## Callers
  - app/(auth)/pair.tsx — reads id, user_a_id, user_b_id, invite_code_expires_at
  - lib/coupleJoin.ts  — reads id, user_a_id, user_b_id, invite_code_expires_at
  Both callers already treat the return value as a plain object; no JS changes needed.
*/

DROP FUNCTION IF EXISTS public.get_couple_by_invite_code(text);

CREATE FUNCTION public.get_couple_by_invite_code(code text)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT row_to_json(r)
  FROM (
    SELECT
      id,
      user_a_id,
      user_b_id,
      active,
      invite_code,
      invite_code_expires_at,
      subscription_owner_id,
      points_enabled,
      streaks_enabled
    FROM public.couples
    WHERE invite_code = code
      AND user_b_id IS NULL
    LIMIT 1
  ) r;
$$;

GRANT EXECUTE ON FUNCTION public.get_couple_by_invite_code(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
