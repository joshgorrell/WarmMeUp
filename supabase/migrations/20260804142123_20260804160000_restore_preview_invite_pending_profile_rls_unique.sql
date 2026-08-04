/*
# Restore Missing Pairing Functions + Add Pending-Partner RLS + Unique Invite Code Index

## Background

A post-squash audit found two SECURITY DEFINER functions (`preview_invite` and
`get_pending_partner_profile`) that exist only in archived migrations — the
active migration set is missing them, so a fresh database would break the
pairing flow. Additionally, User B's realtime subscription to the couple row
is dead because RLS only allows `user_a_id`/`user_b_id` — not
`pending_partner_id`. Finally, `couples.invite_code` has no UNIQUE constraint,
creating a race-condition risk for duplicate codes.

## What This Migration Does

### 1. Restores `preview_invite(invite_code text)`
- SECURITY DEFINER, authenticated only.
- Returns the inviter's display_name and avatar_url for a valid open invite
  code (user_b_id IS NULL, pending_partner_id IS NULL).
- Lets User B see who they are connecting with before committing.

### 2. Restores `get_pending_partner_profile()`
- SECURITY DEFINER, authenticated only.
- Called by User A to see the pending partner's name + avatar before
  confirming the connection.

### 3. Adds RLS SELECT policy for pending partners on `couples`
- New policy "Pending partner can view couple" allows a user to SELECT a
  couple row where they are the `pending_partner_id` AND `user_b_id IS NULL`.
- This makes User B's realtime subscription functional, so they see
  accept/decline instantly instead of waiting up to 4 seconds for the polling
  fallback.
- The policy is scoped to the pending state only — once paired
  (user_b_id IS NOT NULL), the existing "Couple members can view their couple"
  policy takes over.

### 4. Adds partial UNIQUE index on `couples.invite_code`
- `CREATE UNIQUE INDEX IF NOT EXISTS couples_invite_code_unique_open
   ON couples (invite_code) WHERE user_b_id IS NULL;`
- Only open/unused codes must be unique; used codes (user_b_id IS NOT NULL)
  are excluded from the index so historical rows don't conflict.
- Prevents race conditions where two solo couples get the same code.

### 5. Adds `force_new` parameter to `generate_invite_code`
- New signature: `generate_invite_code(force_new boolean DEFAULT false)`.
- When `force_new = false` (default): returns existing unused code if one
  exists (current behavior — preserves app-open stability).
- When `force_new = true`: always generates a new random code, even if one
  exists. Used by the refresh button so users can explicitly get a new code.
- The old zero-arg call signature still works (Postgres allows omitting a
  DEFAULT parameter).

## Tables Involved
- `couples` — RLS policy + unique index + generate_invite_code modification.
- `profiles` — joined by preview_invite and get_pending_partner_profile.

## Security
- Both restored functions are SECURITY DEFINER with `search_path = public`,
  granted to `authenticated` only (anon revoked).
- The new RLS policy is additive — it only grants SELECT, and only for the
  pending state where the caller is the pending partner.
- The unique index is a data-integrity constraint, not a security change.

## Idempotency
- All functions use `CREATE OR REPLACE`.
- The index uses `IF NOT EXISTS`.
- The policy uses `DROP POLICY IF EXISTS` before creation.
- Safe to re-run.

## Important Notes
1. The `generate_invite_code()` signature change from zero args to one
   optional arg (`force_new boolean DEFAULT false`) is backwards-compatible:
   existing client calls that omit the argument still work.
2. The client refresh button will be updated in a separate code change to
   pass `{ force_new: true }`.
*/
-- ─── 1. Restore preview_invite ────────────────────────────────────────────────
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

-- ─── 2. Restore get_pending_partner_profile ──────────────────────────────────
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

-- ─── 3. RLS: Pending partner can view the couple row while waiting ──────────
-- This allows User B (who is pending_partner_id, not yet user_b_id) to
-- receive realtime updates on the couple row, so they see accept/decline
-- instantly instead of relying solely on the 4-second polling fallback.
DROP POLICY IF EXISTS "Pending partner can view couple" ON couples;
CREATE POLICY "Pending partner can view couple"
ON couples FOR SELECT
TO authenticated
USING (pending_partner_id = auth.uid() AND user_b_id IS NULL);

-- ─── 4. Partial UNIQUE index on invite_code for open/unused codes ───────────
-- Only open couples (user_b_id IS NULL) need unique codes. Once paired,
-- the code is consumed and excluded from the index so historical rows
-- don't conflict.
CREATE UNIQUE INDEX IF NOT EXISTS couples_invite_code_unique_open
  ON couples (invite_code)
  WHERE user_b_id IS NULL;

-- ─── 5. generate_invite_code with force_new parameter ───────────────────────
-- Backwards-compatible: force_new defaults to false, so existing zero-arg
-- calls still work. When false, returns the existing unused code if one
-- exists (preserves app-open stability). When true, always generates a
-- fresh code (used by the refresh button).
CREATE OR REPLACE FUNCTION public.generate_invite_code(force_new boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_user_id   uuid;
  v_couple_id uuid;
  v_code      text;
  v_existing  text;
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

  -- Find any solo couple for this user (active or inactive) — prefer active
  SELECT id, invite_code
  INTO v_couple_id, v_existing
  FROM public.couples
  WHERE user_a_id = v_user_id AND user_b_id IS NULL
  ORDER BY active DESC, created_at DESC
  LIMIT 1;

  -- If the couple already has an unused invite code and force_new is false,
  -- return it as-is. This prevents the code from changing every time the
  -- user opens the app.
  IF v_couple_id IS NOT NULL AND v_existing IS NOT NULL AND force_new = false THEN
    -- Ensure the couple is marked active so the code is usable.
    UPDATE public.couples SET active = true WHERE id = v_couple_id AND active = false;
    RETURN jsonb_build_object('success', true, 'invite_code', v_existing, 'couple_id', v_couple_id);
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

REVOKE ALL ON FUNCTION public.generate_invite_code(boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.generate_invite_code(boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.generate_invite_code(boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';
