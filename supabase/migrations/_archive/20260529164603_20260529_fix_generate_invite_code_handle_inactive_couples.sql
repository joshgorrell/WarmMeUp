/*
  # Fix generate_invite_code — handle inactive couples and eliminate silent errors

  ## Summary
  Replaces the current generate_invite_code() function which silently returns
  { "error": "no_eligible_couple" } when no active=true solo couple exists.
  This caused the app's `if (rpcError || !result)` check to pass (since the
  object is truthy) while result.invite_code was undefined.

  ## Changes

  ### generate_invite_code()
  - Uses CREATE OR REPLACE (no DROP) to avoid invalidating the PostgREST OID cache
  - Finds any solo couple for the caller (user_b_id IS NULL) regardless of active state
  - If found: sets active=true and writes a fresh invite code
  - If not found: creates a new couple row with active=true
  - Returns { "success": true, "invite_code": "XXXXXX" } on success
  - RAISES a real exception on failure instead of returning a silent error object
    so PostgREST returns a proper HTTP error that supabase-js surfaces as rpcError

  ## Security
  - SECURITY DEFINER so it can bypass RLS on couples
  - search_path locked to 'public'
  - GRANT EXECUTE to authenticated only
  - Anon access revoked

  ## Notes
  - Uses the same safe alphabet as the existing trigger (ACDEFGHJKLMNPQRTUVWXY34679)
  - NOTIFY pgrst at end to flush PostgREST schema cache
*/

CREATE OR REPLACE FUNCTION public.generate_invite_code()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_user_id  uuid;
  v_couple_id uuid;
  v_code     text;
  v_alphabet text := 'ACDEFGHJKLMNPQRTUVWXY34679';
  v_attempts int  := 0;
  i          int;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'P0001';
  END IF;

  -- Generate a unique 6-char code from the safe alphabet
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

  -- Find any solo couple for this user (active or inactive) — prefer active
  SELECT id INTO v_couple_id
  FROM public.couples
  WHERE user_a_id = v_user_id
    AND user_b_id IS NULL
  ORDER BY active DESC, created_at DESC
  LIMIT 1;

  IF v_couple_id IS NOT NULL THEN
    -- Reactivate and stamp the new invite code
    UPDATE public.couples
    SET invite_code = v_code,
        active      = true
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

-- Ensure only authenticated users can call this
REVOKE ALL ON FUNCTION public.generate_invite_code() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.generate_invite_code() FROM anon;
GRANT EXECUTE ON FUNCTION public.generate_invite_code() TO authenticated;

-- Flush PostgREST schema cache
NOTIFY pgrst, 'reload schema';
