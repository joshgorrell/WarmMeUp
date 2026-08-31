/*
  # Add generate_invite_code RPC function (v2)

  ## Summary
  Moves invite code generation server-side to bypass PostgREST schema cache issues
  (PGRST204 error on invite_code_expires_at column).

  ## Changes
  - Drops and recreates public.generate_invite_code() with json return type
    - SECURITY DEFINER — runs with elevated privileges, bypasses schema cache column lookups
    - Handles both INSERT (no solo couple exists) and UPDATE (refresh existing code)
    - Generates a 6-character random code from the same alphabet used client-side
    - Sets invite_code_expires_at to now() + 7 days
    - Returns the new invite_code and invite_code_expires_at as JSON

  ## Security
  - EXECUTE granted to authenticated users only
  - Function verifies auth.uid() before writing
*/

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
  v_expires_at timestamptz;
  v_alphabet text := 'ACDEFGHJKLMNPQRTUVWXY34679';
  v_code_length int := 6;
  i int;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Generate a random 6-character code from the same alphabet as the client
  v_code := '';
  FOR i IN 1..v_code_length LOOP
    v_code := v_code || substr(v_alphabet, floor(random() * length(v_alphabet))::int + 1, 1);
  END LOOP;

  v_expires_at := now() + interval '7 days';

  -- Try to find an existing solo couple (no partner, active)
  SELECT id INTO v_couple_id
  FROM public.couples
  WHERE user_a_id = v_user_id
    AND user_b_id IS NULL
    AND active = true
  LIMIT 1;

  IF v_couple_id IS NOT NULL THEN
    -- Update existing solo couple
    UPDATE public.couples
    SET invite_code = v_code,
        invite_code_expires_at = v_expires_at
    WHERE id = v_couple_id;
  ELSE
    -- Insert a new solo couple
    INSERT INTO public.couples (
      user_a_id,
      user_b_id,
      active,
      invite_code,
      invite_code_expires_at,
      subscription_owner_id,
      points_enabled,
      streaks_enabled
    ) VALUES (
      v_user_id,
      NULL,
      true,
      v_code,
      v_expires_at,
      v_user_id,
      true,
      true
    )
    RETURNING id INTO v_couple_id;
  END IF;

  RETURN json_build_object(
    'invite_code', v_code,
    'invite_code_expires_at', v_expires_at,
    'couple_id', v_couple_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_invite_code() TO authenticated;
