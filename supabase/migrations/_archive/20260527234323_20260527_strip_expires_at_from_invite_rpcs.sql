/*
  # Strip invite_code_expires_at from all invite-related RPCs

  ## Problem
  PostgREST schema cache cannot resolve the invite_code_expires_at column on the
  couples table, producing PGRST204 errors on every invite code generation/lookup.
  The column exists in Postgres but is invisible to the live PostgREST cache.

  ## Fix
  Remove invite_code_expires_at from both RPCs entirely. The column stays in the
  database; expiration can be re-enabled later with a clean migration once the
  schema cache issue is resolved.

  ## Changes
  1. generate_invite_code() — removes invite_code_expires_at from:
     - UPDATE SET clause
     - INSERT columns/values
     - json_build_object() return value
     Returns: { invite_code, couple_id }

  2. get_couple_by_invite_code(text) — removes invite_code_expires_at from
     the SELECT column list inside row_to_json().
     Returns: { id, user_a_id, user_b_id, active, invite_code,
                subscription_owner_id, points_enabled, streaks_enabled }

  3. NOTIFY pgrst to flush schema cache.
*/

-- 1. Rebuild generate_invite_code without invite_code_expires_at
DROP FUNCTION IF EXISTS public.generate_invite_code();

CREATE FUNCTION public.generate_invite_code()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_couple_id uuid;
  v_code text;
  v_alphabet text := 'ACDEFGHJKLMNPQRTUVWXY34679';
  v_code_length int := 6;
  i int;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Generate a random 6-character code
  v_code := '';
  FOR i IN 1..v_code_length LOOP
    v_code := v_code || substr(v_alphabet, floor(random() * length(v_alphabet))::int + 1, 1);
  END LOOP;

  -- Try to find an existing solo couple (no partner, active)
  SELECT id INTO v_couple_id
  FROM public.couples
  WHERE user_a_id = v_user_id
    AND user_b_id IS NULL
    AND active = true
  LIMIT 1;

  IF v_couple_id IS NOT NULL THEN
    UPDATE public.couples
    SET invite_code = v_code
    WHERE id = v_couple_id;
  ELSE
    INSERT INTO public.couples (
      user_a_id,
      user_b_id,
      active,
      invite_code,
      subscription_owner_id,
      points_enabled,
      streaks_enabled
    ) VALUES (
      v_user_id,
      NULL,
      true,
      v_code,
      v_user_id,
      true,
      true
    )
    RETURNING id INTO v_couple_id;
  END IF;

  RETURN json_build_object(
    'invite_code', v_code,
    'couple_id', v_couple_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_invite_code() TO authenticated;

-- 2. Rebuild get_couple_by_invite_code without invite_code_expires_at
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

-- 3. Flush PostgREST schema cache
NOTIFY pgrst, 'reload schema';
