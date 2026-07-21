/*
  # Three-Step Pairing Handshake

  Changes the mutual-consent pairing from a two-step request/accept model
  to a three-step handshake where both sides see who they are connecting
  with before the couple is finalized:

  1. User A generates an invite code and shares it.
  2. User B enters the code, sees User A's name, creates their profile,
     and "accepts" the invite (sets pending_partner_status = 'b_accepted').
  3. User A sees User B's name + avatar ("Robyn has accepted your invite
     and is ready to join you on Warm Me Up!"), then confirms. The couple
     is finalized.

  ## New RPCs
  - `preview_invite(invite_code text)` — returns the inviter's display_name
    and avatar_url for a valid open invite code. Does NOT create a pending
    request. Lets User B see who they are connecting with before committing.
  - `get_pending_partner_profile()` — callable by User A when a pending
    request exists on their couple row. Returns the pending partner's
    display_name and avatar_url so User A can see who accepted before
    confirming.

  ## Modified RPCs
  - `request_join` — now sets pending_partner_status = 'b_accepted' instead
    of 'pending'. Backwards compatible: accept_partner/decline_partner
    accept both 'pending' and 'b_accepted'.

  ## Security / RLS
  - Both new RPCs are SECURITY DEFINER, authenticated only (anon revoked).
  - No changes to existing couples RLS.

  ## Important notes
  1. Existing already-paired couples are untouched.
  2. Idempotent — safe to re-run.
*/

-- ─── preview_invite ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.preview_invite(invite_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_inviter_name  text;
  v_inviter_avatar text;
  v_couple_id     uuid;
BEGIN
  SELECT c.id, p.display_name, p.avatar_url
  INTO v_couple_id, v_inviter_name, v_inviter_avatar
  FROM public.couples c
  JOIN public.profiles p ON p.id = c.user_a_id
  WHERE c.invite_code = preview_invite.invite_code
    AND c.user_b_id IS NULL
    AND c.pending_partner_id IS NULL
  LIMIT 1;

  IF v_couple_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  RETURN jsonb_build_object(
    'ok',           true,
    'couple_id',    v_couple_id,
    'inviter_name', v_inviter_name,
    'inviter_avatar', v_inviter_avatar
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.preview_invite(text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.preview_invite(text) FROM anon;

-- ─── get_pending_partner_profile ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_pending_partner_profile()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_user_id      uuid;
  v_pending_id   uuid;
  v_partner_name text;
  v_partner_avatar text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'P0001';
  END IF;

  SELECT pending_partner_id
  INTO v_pending_id
  FROM public.couples
  WHERE user_a_id = v_user_id
    AND pending_partner_id IS NOT NULL
    AND pending_partner_status IN ('pending', 'b_accepted')
    AND user_b_id IS NULL
  LIMIT 1;

  IF v_pending_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_pending_request');
  END IF;

  SELECT display_name, avatar_url
  INTO v_partner_name, v_partner_avatar
  FROM public.profiles
  WHERE id = v_pending_id;

  RETURN jsonb_build_object(
    'ok',             true,
    'partner_name',   v_partner_name,
    'partner_avatar', v_partner_avatar
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_pending_partner_profile() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_pending_partner_profile() FROM anon;

-- ─── request_join (updated: sets 'b_accepted' instead of 'pending') ──────────
CREATE OR REPLACE FUNCTION public.request_join(invite_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_user_id   uuid;
  v_couple_id uuid;
  v_user_a_id uuid;
  v_attempts  int;
  v_window    timestamptz;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.couples
    WHERE (user_a_id = v_user_id OR user_b_id = v_user_id)
    AND user_b_id IS NOT NULL
    AND active = true
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_connected');
  END IF;

  SELECT attempt_count, window_start
  INTO v_attempts, v_window
  FROM public.invite_join_attempts
  WHERE user_id = v_user_id
  FOR UPDATE;

  IF v_attempts IS NULL THEN
    INSERT INTO public.invite_join_attempts (user_id, attempt_count, window_start)
    VALUES (v_user_id, 1, now());
  ELSIF now() - v_window > interval '10 minutes' THEN
    UPDATE public.invite_join_attempts
    SET attempt_count = 1, window_start = now()
    WHERE user_id = v_user_id;
  ELSE
    UPDATE public.invite_join_attempts
    SET attempt_count = attempt_count + 1
    WHERE user_id = v_user_id;
    IF v_attempts + 1 > 5 THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
    END IF;
  END IF;

  SELECT id, user_a_id
  INTO v_couple_id, v_user_a_id
  FROM public.couples
  WHERE couples.invite_code = request_join.invite_code
    AND user_b_id IS NULL
    AND pending_partner_id IS NULL
  LIMIT 1;

  IF v_couple_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  IF v_user_a_id = v_user_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'self');
  END IF;

  UPDATE public.couples
  SET pending_partner_id     = v_user_id,
      pending_partner_status = 'b_accepted',
      pending_requested_at   = now()
  WHERE id = v_couple_id
    AND user_b_id IS NULL
    AND pending_partner_id IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_full');
  END IF;

  UPDATE public.invite_join_attempts
  SET attempt_count = 0, window_start = now()
  WHERE user_id = v_user_id;

  RETURN jsonb_build_object(
    'ok',        true,
    'couple_id', v_couple_id,
    'user_a_id', v_user_a_id,
    'status',    'b_accepted'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_join(text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.request_join(text) FROM anon;

-- ─── accept_partner (updated: accept 'pending' OR 'b_accepted') ──────────────
CREATE OR REPLACE FUNCTION public.accept_partner()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_user_id   uuid;
  v_couple_id uuid;
  v_partner_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'P0001';
  END IF;

  SELECT id, pending_partner_id
  INTO v_couple_id, v_partner_id
  FROM public.couples
  WHERE user_a_id = v_user_id
    AND pending_partner_status IN ('pending', 'b_accepted')
    AND user_b_id IS NULL
  LIMIT 1;

  IF v_couple_id IS NULL OR v_partner_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_pending_request');
  END IF;

  UPDATE public.couples
  SET user_b_id              = v_partner_id,
      active                 = true,
      invite_code_used_at    = now(),
      pending_partner_status = 'accepted',
      pending_partner_id     = NULL,
      pending_requested_at   = NULL
  WHERE id = v_couple_id
    AND user_a_id = v_user_id
    AND pending_partner_status IN ('pending', 'b_accepted')
    AND user_b_id IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_full');
  END IF;

  RETURN jsonb_build_object('ok', true, 'couple_id', v_couple_id, 'user_b_id', v_partner_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_partner() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.accept_partner() FROM anon;

-- ─── decline_partner (updated: decline 'pending' OR 'b_accepted') ────────────
CREATE OR REPLACE FUNCTION public.decline_partner()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_user_id   uuid;
  v_couple_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'P0001';
  END IF;

  SELECT id
  INTO v_couple_id
  FROM public.couples
  WHERE user_a_id = v_user_id
    AND pending_partner_status IN ('pending', 'b_accepted')
  LIMIT 1;

  IF v_couple_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_pending_request');
  END IF;

  UPDATE public.couples
  SET pending_partner_status = 'declined',
      pending_partner_id     = NULL,
      pending_requested_at   = NULL
  WHERE id = v_couple_id
    AND user_a_id = v_user_id;

  RETURN jsonb_build_object('ok', true, 'couple_id', v_couple_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.decline_partner() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.decline_partner() FROM anon;

NOTIFY pgrst, 'reload schema';
