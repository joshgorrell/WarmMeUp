/*
  # Force PostgREST schema cache reload for generate_invite_code

  ## Problem
  The installed TestFlight app gets PGRST202: "Could not find the function
  public.generate_invite_code without parameters in the schema cache."
  The function exists and is correct, but PostgREST's cached schema does not
  reflect it — likely due to a cache miss from a previous DROP/CREATE cycle that
  changed the OID without a successful NOTIFY reaching the PostgREST instance.

  ## Fix
  DROP the existing function and CREATE it fresh. This assigns a new OID which
  forces PostgREST to pick it up on the next schema reload, followed by an
  explicit NOTIFY to trigger that reload immediately.

  ## Function: public.generate_invite_code()
  - Zero arguments
  - Returns jsonb: { success, invite_code, couple_id }
  - SECURITY DEFINER, search_path locked to 'public'
  - GRANT EXECUTE to authenticated only; anon explicitly revoked

  ## Security
  - No change to RLS policies
  - Anon access explicitly revoked
*/

-- Step 1: Drop all overloads to clear any stale OID
DROP FUNCTION IF EXISTS public.generate_invite_code();

-- Step 2: Recreate with correct zero-arg signature
CREATE FUNCTION public.generate_invite_code()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_user_id   uuid;
  v_couple_id uuid;
  v_code      text;
  v_alphabet  text := 'ACDEFGHJKLMNPQRTUVWXY34679';
  v_attempts  int  := 0;
  i           int;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'P0001';
  END IF;

  -- Generate a unique 6-char code from a safe alphabet (no ambiguous chars)
  LOOP
    v_code := '';
    FOR i IN 1..6 LOOP
      v_code := v_code || substr(v_alphabet, floor(random() * length(v_alphabet))::int + 1, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.couples WHERE invite_code = v_code);
    v_attempts := v_attempts + 1;
    IF v_attempts > 20 THEN
      RAISE EXCEPTION 'Could not generate unique invite code after 20 attempts' USING ERRCODE = 'P0002';
    END IF;
  END LOOP;

  -- Find any solo couple for this user (active or inactive) — prefer active, then newest
  SELECT id INTO v_couple_id
  FROM public.couples
  WHERE user_a_id = v_user_id
    AND user_b_id IS NULL
  ORDER BY active DESC, created_at DESC
  LIMIT 1;

  IF v_couple_id IS NOT NULL THEN
    -- Reactivate and stamp with the new invite code
    UPDATE public.couples
    SET invite_code = v_code,
        active      = true,
        updated_at  = now()
    WHERE id = v_couple_id;
  ELSE
    -- No couple row at all — create a fresh one
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

  RETURN jsonb_build_object(
    'success',     true,
    'invite_code', v_code,
    'couple_id',   v_couple_id
  );
END;
$$;

-- Step 3: Lock down permissions
REVOKE ALL ON FUNCTION public.generate_invite_code() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.generate_invite_code() FROM anon;
GRANT EXECUTE ON FUNCTION public.generate_invite_code() TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_invite_code() TO service_role;

-- Step 4: Force PostgREST to reload its schema cache
NOTIFY pgrst, 'reload schema';
