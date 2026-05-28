/*
  # Force PostgREST schema cache reload for generate_invite_code

  ## Summary
  Drops and recreates public.generate_invite_code() with an identical body.
  The DROP+CREATE produces a new pg_proc OID, which forces PostgREST to
  re-introspect the function on the next schema cache reload. A NOTIFY is
  also sent immediately after to trigger that reload.

  ## Why this is needed
  PostgREST caches function signatures by OID. Even though the function exists
  correctly in the database, a stale cache can cause the REST API to return
  "could not find function public.generate_invite_code without parameters".
  A new OID invalidates the cache entry and resolves the error.

  ## Changes
  - DROP FUNCTION IF EXISTS public.generate_invite_code() (removes stale OID)
  - CREATE OR REPLACE FUNCTION public.generate_invite_code() (identical body, new OID)
  - GRANT EXECUTE to authenticated and service_role
  - NOTIFY pgrst, 'reload schema' to flush the cache immediately
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

  -- Generate a random 6-character code from the safe alphabet
  v_code := '';
  FOR i IN 1..v_code_length LOOP
    v_code := v_code || substr(v_alphabet, floor(random() * length(v_alphabet))::int + 1, 1);
  END LOOP;

  -- Find existing solo couple (no partner, active)
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

-- Flush PostgREST schema cache so the new OID is picked up immediately
NOTIFY pgrst, 'reload schema';
