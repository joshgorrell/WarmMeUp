/*
  # Recreate generate_invite_code() as a stable zero-argument function

  ## Summary
  Drops and recreates public.generate_invite_code() with zero parameters so the
  PostgREST RPC path `POST /rest/v1/rpc/generate_invite_code` works without any
  request body. The function uses auth.uid() internally.

  ## Changes
  - DROP + CREATE the function (ensures a clean OID and no stale overloads)
  - SECURITY DEFINER so it can write to couples bypassing RLS
  - search_path locked to 'public' to prevent search_path injection
  - GRANT EXECUTE to authenticated
  - NOTIFY pgrst reload to flush the PostgREST schema cache immediately

  ## Function logic
  1. Reads calling user via auth.uid() — raises if not authenticated
  2. Generates a random 6-char code from a safe alphabet
  3. Updates the existing solo couple's invite_code if one exists,
     otherwise inserts a new solo couple row
  4. Returns { invite_code, couple_id }
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

-- Flush PostgREST schema cache so the function is immediately visible via REST
NOTIFY pgrst, 'reload schema';
