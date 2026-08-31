/*
# Fix request_join: don't destroy caller's pending requests before validation

## Problem
The function clears any existing pending request that the caller placed on
any couple BEFORE checking whether the invite code is valid, whether it's
their own code, or whether the inviter has premium. If the join fails, the
caller's prior pending connections are already wiped out.

## Fix
Move the pending-request cleanup to after all validation checks pass,
immediately before the finalizing UPDATE. This way a failed join (invalid
code, self, no subscription) does not destroy the caller's existing pending
connections.
*/

CREATE OR REPLACE FUNCTION public.request_join(invite_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
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

-- ── All validation passed — now safe to clean up caller's prior pending requests ──
UPDATE public.couples
SET pending_partner_id     = NULL,
pending_partner_status  = NULL,
pending_requested_at    = NULL
WHERE pending_partner_id = v_user_id
AND user_b_id IS NULL;

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
$function$;
