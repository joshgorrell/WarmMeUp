/*
  # Force PostgREST schema cache reload v2

  ## Summary
  Second forced DROP + CREATE of public.generate_invite_code() to produce a new
  pg_proc OID and guarantee PostgREST re-introspects the function.

  The previous migration applied the same technique but PostgREST may have missed
  the NOTIFY if its listener connection was not active at that moment. Running the
  cycle a second time at migration-apply time (when PostgREST is most likely to be
  listening) ensures the new OID is picked up.

  ## Changes
  - DROP FUNCTION IF EXISTS public.generate_invite_code()
  - Recreate with identical body (new OID forces cache invalidation)
  - GRANT EXECUTE to authenticated and service_role
  - NOTIFY pgrst, 'reload schema'
*/

DROP FUNCTION IF EXISTS public.generate_invite_code();

CREATE OR REPLACE FUNCTION public.generate_invite_code()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
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

  v_code := '';
  FOR i IN 1..v_code_length LOOP
    v_code := v_code || substr(v_alphabet, floor(random() * length(v_alphabet))::int + 1, 1);
  END LOOP;

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
GRANT EXECUTE ON FUNCTION public.generate_invite_code() TO service_role;

NOTIFY pgrst, 'reload schema';
