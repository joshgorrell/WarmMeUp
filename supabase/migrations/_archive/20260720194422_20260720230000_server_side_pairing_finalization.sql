/*
  # Server-Side Pairing Finalization

  Moves the post-accept finalization work (subscription owner stamping,
  scores seeding, solo-couple cleanup) from the client into the
  `accept_partner()` SECURITY DEFINER RPC so it runs atomically on the
  server with full privileges — regardless of whether User B's app is
  open. Previously this work ran on User B's device via `finalizeJoin()`
  after a realtime update, which meant it silently broke when:
    - User B's app was closed/backgrounded (realtime listener torn down)
    - User B's RLS session could not read User A's subscription row
    - User B lacked UPDATE permission on the couple row

  ## Modified RPCs

  ### accept_partner()
  After writing `user_b_id`, now also performs:
    1. Stamps `subscription_owner_id` with whichever partner has an
       active subscription (queries both users' subscriptions directly).
    2. Seeds `scores` rows (0 points) for both partners if missing.
    3. Deletes User B's solo placeholder couple (where user_a_id = B and
       user_b_id IS NULL), excluding the couple just joined.
  All within the SECURITY DEFINER function — no RLS dependency.

  ### decline_partner()
  Added `AND user_b_id IS NULL` guard to the UPDATE so it cannot clear
  pending fields on an already-finalized couple.

  ### cancel_request()
  Added `AND user_b_id IS NULL` guard to the UPDATE and to the lookup
  SELECT. Also accepts 'b_accepted' status (was only matching 'pending').

  ### request_join()
  Now returns `inviter_name` (display_name from profiles) alongside
  `user_a_id` so callers get a human-readable name instead of a UUID.

  ## Security
  - All RPCs remain SECURITY DEFINER, search_path = public, authenticated
    only (anon revoked).
  - No new tables or columns.
  - No changes to existing RLS policies.

  ## Important notes
  1. Existing already-paired couples are untouched.
  2. Idempotent — safe to re-run (uses ON CONFLICT for scores upsert).
  3. The client-side `finalizeJoin()` function becomes a no-op and will
     be removed from the codebase in a follow-up change.
*/

-- ─── request_join: return inviter_name ──────────────────────────────────────
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
  v_inviter_name text;
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

  SELECT c.id, c.user_a_id, p.display_name
  INTO v_couple_id, v_user_a_id, v_inviter_name
  FROM public.couples c
  LEFT JOIN public.profiles p ON p.id = c.user_a_id
  WHERE c.invite_code = request_join.invite_code
    AND c.user_b_id IS NULL
    AND c.pending_partner_id IS NULL
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
    'ok',          true,
    'couple_id',   v_couple_id,
    'user_a_id',   v_user_a_id,
    'inviter_name', v_inviter_name,
    'status',      'b_accepted'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_join(text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.request_join(text) FROM anon;

-- ─── accept_partner: server-side finalization ───────────────────────────────
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
  v_sub_owner_id uuid;
  v_sub_a uuid;
  v_sub_b uuid;
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

  -- ── Stamp subscription_owner_id ──
  SELECT id INTO v_sub_a FROM public.subscriptions
  WHERE user_id = v_user_id AND status = 'active' LIMIT 1;
  SELECT id INTO v_sub_b FROM public.subscriptions
  WHERE user_id = v_partner_id AND status = 'active' LIMIT 1;

  v_sub_owner_id := COALESCE(
    CASE WHEN v_sub_a IS NOT NULL THEN v_user_id END,
    CASE WHEN v_sub_b IS NOT NULL THEN v_partner_id END
  );

  IF v_sub_owner_id IS NOT NULL THEN
    UPDATE public.couples
    SET subscription_owner_id = v_sub_owner_id
    WHERE id = v_couple_id;
  END IF;

  -- ── Seed scores rows (0 points) for both partners ──
  INSERT INTO public.scores (couple_id, user_id, points)
  VALUES (v_couple_id, v_user_id, 0), (v_couple_id, v_partner_id, 0)
  ON CONFLICT (couple_id, user_id) DO NOTHING;

  -- ── Delete User B's solo placeholder couple ──
  DELETE FROM public.couples
  WHERE user_a_id = v_partner_id
    AND user_b_id IS NULL
    AND id <> v_couple_id;

  RETURN jsonb_build_object('ok', true, 'couple_id', v_couple_id, 'user_b_id', v_partner_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_partner() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.accept_partner() FROM anon;

-- ─── decline_partner: add user_b_id IS NULL guard ────────────────────────────
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
    AND user_b_id IS NULL
  LIMIT 1;

  IF v_couple_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_pending_request');
  END IF;

  UPDATE public.couples
  SET pending_partner_status = 'declined',
      pending_partner_id     = NULL,
      pending_requested_at   = NULL
  WHERE id = v_couple_id
    AND user_a_id = v_user_id
    AND user_b_id IS NULL;

  RETURN jsonb_build_object('ok', true, 'couple_id', v_couple_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.decline_partner() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.decline_partner() FROM anon;

-- ─── cancel_request: add user_b_id IS NULL guard, accept b_accepted ──────────
CREATE OR REPLACE FUNCTION public.cancel_request()
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
  WHERE pending_partner_id = v_user_id
    AND pending_partner_status IN ('pending', 'b_accepted')
    AND user_b_id IS NULL
  LIMIT 1;

  IF v_couple_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_pending_request');
  END IF;

  UPDATE public.couples
  SET pending_partner_status = NULL,
      pending_partner_id     = NULL,
      pending_requested_at   = NULL
  WHERE id = v_couple_id
    AND pending_partner_id = v_user_id
    AND user_b_id IS NULL;

  RETURN jsonb_build_object('ok', true, 'couple_id', v_couple_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_request() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.cancel_request() FROM anon;

NOTIFY pgrst, 'reload schema';
