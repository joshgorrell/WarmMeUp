/*
# Auto-finalize pairing on join + add cancel-invite for inviter

## Changes

### 1. Modify `request_join` — auto-finalize the connection

Previously, `request_join` set `pending_partner_status = 'b_accepted'` and waited
for User A (the inviter) to call `accept_partner()`. This created unnecessary
friction: User A already invited User B by sharing their code, so requiring a
second confirmation is redundant.

Now `request_join` immediately finalizes the connection:
- Sets `user_b_id` to the joining user
- Sets `active = true`
- Clears all pending fields
- Stamps `subscription_owner_id` (same logic as `accept_partner`)
- Seeds scores rows for both partners
- Deletes User B's solo placeholder couple

The inviter (User A) must still have premium access at join time — the same
check that `accept_partner` performed. If the inviter's trial expired, the
join fails with `reason = 'no_subscription'` so User B sees a clear message.

### 2. Add `cancel_pending_partner` — lets inviter cancel a pending request

Previously only User B could cancel (via `cancel_request`). Now User A can
also cancel a pending partner request on their couple row. This clears
`pending_partner_id`, `pending_partner_status`, and `pending_requested_at`.

### 3. Keep `accept_partner` and `decline_partner` for backward compatibility

These functions remain unchanged. They will no longer be called in the normal
flow but existing clients may still reference them.

## Security
- `request_join` is `SECURITY DEFINER`, executable by `authenticated` only.
- `cancel_pending_partner` is `SECURITY DEFINER`, executable by `authenticated` only.
- Both use `auth.uid()` for identity — never `current_user`.
- No RLS policy changes needed.
*/

-- ── Recreate request_join with auto-finalize ──
CREATE OR REPLACE FUNCTION public.request_join(invite_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id      uuid;
  v_couple_id    uuid;
  v_user_a_id    uuid;
  v_attempts     int;
  v_window       timestamptz;
  v_sub_owner_id uuid;
  v_sub_a        uuid;
  v_sub_b        uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'P0001';
  END IF;

  -- Already connected to a partner?
  IF EXISTS (
    SELECT 1 FROM public.couples
    WHERE (user_a_id = v_user_id OR user_b_id = v_user_id)
      AND user_b_id IS NOT NULL
      AND active = true
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_connected');
  END IF;

  -- Clear any existing pending request that THIS user placed on any couple.
  UPDATE public.couples
  SET pending_partner_id     = NULL,
      pending_partner_status  = NULL,
      pending_requested_at    = NULL
  WHERE pending_partner_id = v_user_id
    AND user_b_id IS NULL;

  -- Rate limit: 10 attempts per 10 minutes (reset on success).
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
    IF v_attempts + 1 > 10 THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'rate_limited');
    END IF;
  END IF;

  -- Auto-clear stale pending requests (>30 min old) from other users.
  UPDATE public.couples
  SET pending_partner_id     = NULL,
      pending_partner_status  = NULL,
      pending_requested_at    = NULL
  WHERE user_b_id IS NULL
    AND pending_partner_id IS NOT NULL
    AND pending_partner_id <> v_user_id
    AND pending_requested_at IS NOT NULL
    AND pending_requested_at < now() - interval '30 minutes';

  -- Find the couple with this invite code.
  SELECT id, user_a_id
  INTO v_couple_id, v_user_a_id
  FROM public.couples
  WHERE couples.invite_code = request_join.invite_code
    AND user_b_id IS NULL
  LIMIT 1;

  IF v_couple_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  IF v_user_a_id = v_user_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'self');
  END IF;

  -- Inviter (User A) must have premium access for the connection to finalize.
  IF NOT public.user_has_premium_access(v_user_a_id) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_subscription');
  END IF;

  -- ── Finalize the connection immediately ──
  UPDATE public.couples
  SET user_b_id              = v_user_id,
      active                 = true,
      invite_code_used_at    = now(),
      pending_partner_status = 'accepted',
      pending_partner_id     = NULL,
      pending_requested_at   = NULL
  WHERE id = v_couple_id
    AND user_b_id IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  -- Reset rate limit on success.
  UPDATE public.invite_join_attempts
  SET attempt_count = 0, window_start = now()
  WHERE user_id = v_user_id;

  -- ── Stamp subscription_owner_id ──
  SELECT id INTO v_sub_a FROM public.subscriptions
  WHERE user_id = v_user_a_id AND status = 'active' LIMIT 1;
  SELECT id INTO v_sub_b FROM public.subscriptions
  WHERE user_id = v_user_id AND status = 'active' LIMIT 1;

  v_sub_owner_id := COALESCE(
    CASE WHEN v_sub_a IS NOT NULL THEN v_user_a_id END,
    CASE WHEN v_sub_b IS NOT NULL THEN v_user_id END
  );

  IF v_sub_owner_id IS NOT NULL THEN
    UPDATE public.couples SET subscription_owner_id = v_sub_owner_id WHERE id = v_couple_id;
  END IF;

  -- ── Seed scores rows (0 points) for both partners ──
  INSERT INTO public.scores (couple_id, user_id, points)
  VALUES (v_couple_id, v_user_a_id, 0), (v_couple_id, v_user_id, 0)
  ON CONFLICT (couple_id, user_id) DO NOTHING;

  -- ── Delete User B's solo placeholder couple ──
  DELETE FROM public.couples
  WHERE user_a_id = v_user_id AND user_b_id IS NULL AND id <> v_couple_id;

  RETURN jsonb_build_object(
    'ok',        true,
    'couple_id', v_couple_id,
    'user_a_id', v_user_a_id,
    'status',    'accepted'
  );
END;
$$;

-- ── Add cancel_pending_partner for inviter (User A) ──
CREATE OR REPLACE FUNCTION public.cancel_pending_partner()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
    AND pending_partner_id IS NOT NULL
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
    AND user_a_id = v_user_id
    AND user_b_id IS NULL;

  RETURN jsonb_build_object('ok', true, 'couple_id', v_couple_id);
END;
$$;

-- Grant execute to authenticated only
REVOKE ALL ON FUNCTION public.cancel_pending_partner() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_pending_partner() FROM anon;
GRANT EXECUTE ON FUNCTION public.cancel_pending_partner() TO authenticated;

-- Re-grant execute on request_join (revoke + grant to be safe)
REVOKE ALL ON FUNCTION public.request_join(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.request_join(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.request_join(text) TO authenticated;
