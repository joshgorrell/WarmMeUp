-- join_couple: atomic, SECURITY DEFINER function so a new user can set
-- themselves as user_b on a couple they don't yet belong to.
-- The existing UPDATE RLS QUAL (auth.uid() = user_a_id OR auth.uid() = user_b_id)
-- correctly blocks direct table updates from outsiders — this RPC is the
-- only sanctioned path for joining.

CREATE OR REPLACE FUNCTION public.join_couple(invite_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id   uuid;
  v_couple_id uuid;
  v_user_a_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'P0001';
  END IF;

  -- Block if caller is already in an active paired couple
  IF EXISTS (
    SELECT 1 FROM public.couples
    WHERE (user_a_id = v_user_id OR user_b_id = v_user_id)
    AND user_b_id IS NOT NULL
    AND active = true
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_connected');
  END IF;

  -- Look up the open couple by invite code
  SELECT id, user_a_id
  INTO v_couple_id, v_user_a_id
  FROM public.couples
  WHERE couples.invite_code = join_couple.invite_code
    AND user_b_id IS NULL
  LIMIT 1;

  IF v_couple_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  IF v_user_a_id = v_user_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'self');
  END IF;

  -- Atomic join — if another request beats us to it, FOUND will be false
  UPDATE public.couples
  SET user_b_id           = v_user_id,
      active              = true,
      invite_code_used_at = now()
  WHERE id = v_couple_id
    AND user_b_id IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_full');
  END IF;

  RETURN jsonb_build_object(
    'ok',         true,
    'couple_id',  v_couple_id,
    'user_a_id',  v_user_a_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.join_couple(text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.join_couple(text) FROM anon;
