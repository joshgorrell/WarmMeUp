/*
# Restore Pairing Functions to Active Migration History

## Background

The migration squash that produced `20260722000000_baseline_schema.sql` missed
five SECURITY DEFINER functions that are core to the couple pairing flow.
These functions existed historically (in now-archived migrations) and were
already applied to the live database, but they were never carried forward
into the active migration set. This means:

- The current production database still works (functions persist once created).
- A fresh database rebuilt from the active migration files alone would have
  NO pairing functions — `generate_invite_code()`, `accept_partner()`,
  `decline_partner()`, `cancel_request()`, and the `user_has_premium_access()`
  helper would all be missing, making the entire invite-and-pair flow
  non-functional.

This migration restores all five functions so the migration history is
self-sufficient.

## What This Migration Does

1. Creates / restores five SECURITY DEFINER PL/pgSQL functions in dependency
   order (helper first, then the four RPCs that depend on it):

   - `user_has_premium_access(p_user_id uuid)` — returns true if the user
     is an admin/super-admin, has an active paid/trial subscription, or has
     an active admin grant with `can_invite = true`. Used by
     `generate_invite_code()` and `accept_partner()` to gate on the
     inviter's subscription status.

   - `generate_invite_code()` — called by User A (the inviter). Checks the
     caller is not already paired, verifies premium access, generates a
     unique 6-character invite code from a safe alphabet (no ambiguous
     characters), and creates or refreshes a solo couple row with that code.
     Returns `{ success, invite_code, couple_id }` or
     `{ success: false, reason: 'no_subscription' }`.

   - `accept_partner()` — called by User A to finalize pairing. Sets
     `user_b_id` to the pending partner, marks the couple active, stamps
     `subscription_owner_id`, seeds zero-point `scores` rows for both
     partners, and deletes User B's now-obsolete solo placeholder couple.
     Returns `{ ok: true, couple_id, user_b_id }` or an error reason.

   - `decline_partner()` — called by User A to reject a pending partner
     request. Sets `pending_partner_status = 'declined'` and clears the
     pending fields.

   - `cancel_request()` — called by User B to withdraw their own pending
     request. Clears all pending fields on the couple row.

2. Sets EXECUTE grants:
   - `generate_invite_code`: revoke from PUBLIC + anon, grant to authenticated.
   - `accept_partner`, `decline_partner`, `cancel_request`: grant to
     authenticated, revoke from anon.
   - `user_has_premium_access`: grant to authenticated (called internally
     by the other functions; also callable directly if needed).

3. Sends `NOTIFY pgrst, 'reload schema'` so PostgREST picks up the new
   function signatures immediately.

## Tables Involved (all already created by baseline migration)

- `couples` — the couple row holding invite codes, pending partner state.
- `subscriptions` — checked by `user_has_premium_access`.
- `admin_grants` — checked by `user_has_premium_access`.
- `profiles` — admin/super-admin flags checked by `user_has_premium_access`.
- `scores` — zero-point rows seeded by `accept_partner`.

## Security

- All five functions are `SECURITY DEFINER` with `search_path = public`,
  matching the live definitions.
- `generate_invite_code` is revoked from PUBLIC and anon so only
  authenticated users can call it.
- The other three RPCs are granted to authenticated and revoked from anon.
- `user_has_premium_access` is granted to authenticated.

## Idempotency

All functions use `CREATE OR REPLACE`, so this migration is safe to re-run.
On the current production database it is a no-op (functions already exist
with identical definitions). On a fresh database it creates them for the
first time.

## Important Notes

1. The function definitions here were verified against the LIVE database
   definitions on 2026-08-03 and match exactly — including comments,
   control flow, and grant statements.
2. The `random()` call in `generate_invite_code` uses Postgres's standard
   `random()` (not `pgcrypto`'s CSPRNG). This is acceptable given the
   existing rate-limiting on join attempts. Hardening to `gen_random_bytes`
   is a future improvement, not urgent.
3. The `lib/inviteCode.ts` client-side `generateInviteCode()` using
   `Math.random()` is dead code (never called) and is not addressed here.
*/

-- ─── Helper: does this user currently have premium access? ───────────────
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
    NULL; -- no profile row yet — fall through to subscription checks
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

GRANT EXECUTE ON FUNCTION public.user_has_premium_access(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.user_has_premium_access(uuid) FROM anon;

-- ─── generate_invite_code: create/refresh User A's invite code ───────────
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
  WHERE user_a_id = v_user_id AND user_b_id IS NULL
  ORDER BY active DESC, created_at DESC
  LIMIT 1;

  IF v_couple_id IS NOT NULL THEN
    UPDATE public.couples SET invite_code = v_code, active = true WHERE id = v_couple_id;
  ELSE
    INSERT INTO public.couples (
      user_a_id, user_b_id, active, invite_code,
      subscription_owner_id, points_enabled, streaks_enabled
    ) VALUES (
      v_user_id, NULL, true, v_code, v_user_id, true, true
    )
    RETURNING id INTO v_couple_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'invite_code', v_code, 'couple_id', v_couple_id);
END;
$$;

REVOKE ALL ON FUNCTION public.generate_invite_code() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.generate_invite_code() FROM anon;
GRANT EXECUTE ON FUNCTION public.generate_invite_code() TO authenticated;

-- ─── accept_partner: User A finalizes the pairing ─────────────────────────
CREATE OR REPLACE FUNCTION public.accept_partner()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id      uuid;
  v_couple_id    uuid;
  v_partner_id   uuid;
  v_sub_owner_id uuid;
  v_sub_a        uuid;
  v_sub_b        uuid;
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
    UPDATE public.couples SET subscription_owner_id = v_sub_owner_id WHERE id = v_couple_id;
  END IF;

  -- ── Seed scores rows (0 points) for both partners ──
  INSERT INTO public.scores (couple_id, user_id, points)
  VALUES (v_couple_id, v_user_id, 0), (v_couple_id, v_partner_id, 0)
  ON CONFLICT (couple_id, user_id) DO NOTHING;

  -- ── Delete User B's solo placeholder couple ──
  DELETE FROM public.couples
  WHERE user_a_id = v_partner_id AND user_b_id IS NULL AND id <> v_couple_id;

  RETURN jsonb_build_object('ok', true, 'couple_id', v_couple_id, 'user_b_id', v_partner_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_partner() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.accept_partner() FROM anon;

-- ─── decline_partner: User A rejects the pending request ─────────────────
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

  SELECT id INTO v_couple_id
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

-- ─── cancel_request: User B withdraws their own pending request ──────────
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

  SELECT id INTO v_couple_id
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
