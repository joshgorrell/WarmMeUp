/*
  # Enforce inviter (User A) subscription requirement server-side

  ## Summary
  Moves the "User A must have a subscription or trial" rule from a
  client-only check into the database RPCs that create invite codes and
  finalize pairing. Previously the only gate was `subscriptionInfo.canInvite`
  on the client, which can be bypassed by calling the RPCs directly. Now
  the server is the real enforcement point.

  The rule applies only to the inviter (User A). User B (the person joining
  with a code) never needs a subscription — they are covered by User A's
  subscription once paired. This preserves the existing partner-sharing
  model where either user can be the paying subscriber.

  ## New Functions
  - `user_has_premium_access(p_user_id uuid) RETURNS boolean`
    SECURITY DEFINER helper that returns true when the given user has any
    of: own active paid subscription, active trial, active admin grant
    (with can_invite = true), or is an admin / super_admin. Mirrors the
    logic in the `get-effective-subscription` edge function so the DB and
    the edge function agree on what "premium access" means.

  ## Modified RPCs
  ### generate_invite_code()
  - Adds a guard near the top: if `user_has_premium_access(auth.uid())`
    is false, returns `{ success: false, reason: 'no_subscription' }`
    instead of creating/refreshing an invite code. The client uses this
    reason to present the inline subscribe-and-invite flow.
  - All other behavior unchanged (find-or-create solo couple, stamp code).

  ### accept_partner()
  - Adds a guard after locating the pending request but before finalizing:
    if `user_has_premium_access(auth.uid())` is false, returns
    `{ ok: false, reason: 'no_subscription' }`. Handles the case where User
    A's subscription expired while a request was pending.
  - The existing subscription_owner_id stamping logic (pick whichever
    partner has an active sub at finalization) is unchanged.

  ## Security
  - All functions remain SECURITY DEFINER, search_path = public.
  - `user_has_premium_access` is granted EXECUTE to authenticated only;
    anon is revoked so it cannot be probed by unauthenticated callers.
  - No new tables or columns. No changes to existing RLS policies.

  ## Important notes
  1. Existing already-paired couples are untouched.
  2. Idempotent — safe to re-run (CREATE OR REPLACE FUNCTION).
  3. The client-side `canInvite` check stays as a UX nicety; the server is
     now the authoritative gate.
*/

-- ─── user_has_premium_access helper ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.user_has_premium_access(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin       boolean;
  v_is_super_admin boolean;
  v_sub_plan       text;
  v_sub_status     text;
  v_sub_expires_at timestamptz;
  v_grant_active   boolean;
  v_grant_expires  timestamptz;
  v_grant_can_invite boolean;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN false;
  END IF;

  -- 1. admin / super_admin profile flags
  SELECT is_admin, is_super_admin
  INTO v_is_admin, v_is_super_admin
  FROM public.profiles
  WHERE id = p_user_id;

  IF v_is_super_admin IS NULL AND v_is_admin IS NULL THEN
    -- No profile row yet — fall through to subscription checks.
    NULL;
  ELSIF v_is_super_admin = true OR v_is_admin = true THEN
    RETURN true;
  END IF;

  -- 2. Own subscription row — paid plan or active trial
  SELECT plan, status, expires_at
  INTO v_sub_plan, v_sub_status, v_sub_expires_at
  FROM public.subscriptions
  WHERE user_id = p_user_id
  LIMIT 1;

  IF v_sub_status = 'active'
     AND v_sub_plan IN ('monthly', 'yearly', 'trial')
     AND (v_sub_expires_at IS NULL OR v_sub_expires_at > now())
  THEN
    RETURN true;
  END IF;

  -- 3. Active admin grant with can_invite = true
  SELECT active, expires_at, can_invite
  INTO v_grant_active, v_grant_expires, v_grant_can_invite
  FROM public.admin_grants
  WHERE user_id = p_user_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_grant_active = true
     AND v_grant_can_invite = true
     AND (v_grant_expires IS NULL OR v_grant_expires > now())
  THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.user_has_premium_access(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_has_premium_access(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.user_has_premium_access(uuid) TO authenticated;

-- ─── generate_invite_code: enforce inviter subscription ─────────────────────
CREATE OR REPLACE FUNCTION public.generate_invite_code()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
  IF EXISTS (
    SELECT 1 FROM public.couples
    WHERE (user_a_id = v_user_id OR user_b_id = v_user_id)
      AND user_b_id IS NOT NULL
      AND active = true
  ) THEN
    RAISE EXCEPTION 'already_paired' USING ERRCODE = 'P0003';
  END IF;

  -- Inviter (User A) must have premium access (paid sub, trial, admin grant,
  -- or admin flag). User B never calls this RPC.
  IF NOT public.user_has_premium_access(v_user_id) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'no_subscription');
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
    UPDATE public.couples
    SET invite_code = v_code,
        active      = true
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

  RETURN jsonb_build_object(
    'success',     true,
    'invite_code', v_code,
    'couple_id',   v_couple_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.generate_invite_code() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.generate_invite_code() FROM anon;
GRANT EXECUTE ON FUNCTION public.generate_invite_code() TO authenticated;

-- ─── accept_partner: enforce inviter subscription before finalizing ───────────
CREATE OR REPLACE FUNCTION public.accept_partner()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

  -- Inviter (User A) must still have premium access at finalization time.
  -- Catches the case where the subscription expired while a request was pending.
  IF NOT public.user_has_premium_access(v_user_id) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_subscription');
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

NOTIFY pgrst, 'reload schema';
