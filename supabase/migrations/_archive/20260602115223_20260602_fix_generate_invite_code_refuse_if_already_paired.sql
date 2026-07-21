/*
  # Fix generate_invite_code — refuse when caller is already in an active paired couple

  ## Summary
  Previously, generate_invite_code() only looked for solo rows (user_b_id IS NULL)
  when deciding whether to create a new couple. If the caller was already paired
  (user_b_id IS NOT NULL, active = true), it found no solo row and created a brand-new
  orphan solo couple — exactly what happened for Josh on 2026-06-02.

  ## Changes

  ### generate_invite_code()
  - Adds a paired-user guard at the top: if the caller already has an active couple
    with user_b_id IS NOT NULL, raises EXCEPTION 'already_paired' (ERRCODE P0003)
    instead of creating a new row
  - All other behavior is unchanged (find solo couple OR create one, return invite_code)

  ## Security
  - SECURITY DEFINER, search_path locked to 'public'
  - GRANT EXECUTE to authenticated only
  - Anon access revoked
*/

CREATE OR REPLACE FUNCTION public.generate_invite_code()
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

  -- Refuse if the caller is already in an active paired couple.
  -- This prevents a spurious solo row from being created when the pair screen
  -- is visited by a user who is already connected to a partner.
  IF EXISTS (
    SELECT 1 FROM public.couples
    WHERE (user_a_id = v_user_id OR user_b_id = v_user_id)
      AND user_b_id IS NOT NULL
      AND active = true
  ) THEN
    RAISE EXCEPTION 'already_paired' USING ERRCODE = 'P0003';
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

NOTIFY pgrst, 'reload schema';
