/*
# Restore Subscription Gate on Invite-Code Generation

## Context
The prior migration (20260819120000) removed ALL subscription gating from
pairing. The business rule is more nuanced: User A must have a trial, paid
subscription, or active entitlement to GENERATE an invite code, but once a
code exists, the actual join/finalize flow is not blocked by either user's
subscription status.

## Changes
Restores the `user_has_premium_access(v_user_id)` check in
`generate_invite_code()` that was removed by the prior migration. The
function once again returns `{ success: false, reason: 'no_subscription' }`
when the caller lacks premium access (paid sub, trial, admin grant, or admin
flag).

`request_join`, `accept_partner`, and `get_my_pending_join` are NOT touched
— they remain ungated from the prior migration.
*/

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

NOTIFY pgrst, 'reload schema';
