/*
# Fix preview_invite for unauthenticated users

## Problem
The pre-auth pairing screen ("Enter your partner's code") calls preview_invite
to show the inviter's name before the user creates an account. But:
1. anon role has no EXECUTE grant (revoked in a prior migration)
2. The function raises an exception when auth.uid() is NULL
3. The preview_invite_calls table doesn't exist, so the INSERT inside the
   function errors out even for authenticated users

## Changes
1. Recreate preview_invite_calls table (was missing from DB)
2. Make user_id nullable, add ip_hash column for anon rate limiting
3. Recreate preview_invite to allow anon callers (no auth.uid() check)
4. Rate limit by user_id when authenticated, by ip_hash when anon
5. Grant EXECUTE to anon role
*/

-- ── 1. Recreate the rate-limit tracking table ──
CREATE TABLE IF NOT EXISTS public.preview_invite_calls (
  id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id   uuid,
  ip_hash   text,
  called_at timestamptz NOT NULL DEFAULT now()
);

-- Make user_id nullable (it's null for anon callers)
ALTER TABLE public.preview_invite_calls ALTER COLUMN user_id DROP NOT NULL;

-- Add index for both authenticated and anon lookups
CREATE INDEX IF NOT EXISTS preview_invite_calls_user_time_idx
  ON public.preview_invite_calls (user_id, called_at);
CREATE INDEX IF NOT EXISTS preview_invite_calls_iphash_time_idx
  ON public.preview_invite_calls (ip_hash, called_at);

ALTER TABLE public.preview_invite_calls ENABLE ROW LEVEL SECURITY;
-- No policies: only accessed via SECURITY DEFINER function (bypasses RLS)
REVOKE ALL ON public.preview_invite_calls FROM authenticated;
REVOKE ALL ON public.preview_invite_calls FROM anon;

-- ── 2. Recreate preview_invite to support anon callers ──
CREATE OR REPLACE FUNCTION public.preview_invite(invite_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_inviter_first   text;
  v_inviter_last    text;
  v_inviter_avatar  text;
  v_couple_id       uuid;
  v_caller_id       uuid;
  v_ip_hash         text;
  v_recent_calls    int;
BEGIN
  v_caller_id := auth.uid();
  -- No exception for NULL caller — anon users can preview codes

  -- Rate limit: 20 calls per 60 seconds per user (or per IP for anon)
  IF v_caller_id IS NOT NULL THEN
    SELECT count(*) INTO v_recent_calls
    FROM public.preview_invite_calls
    WHERE user_id = v_caller_id
    AND called_at > now() - interval '60 seconds';

    IF v_recent_calls >= 20 THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'rate_limited');
    END IF;

    INSERT INTO public.preview_invite_calls (user_id) VALUES (v_caller_id);
    DELETE FROM public.preview_invite_calls
    WHERE user_id = v_caller_id
    AND called_at < now() - interval '5 minutes';
  ELSE
    -- Anon: rate limit by IP hash from request headers
    v_ip_hash := current_setting('request.header.x-forwarded-for', true);
    IF v_ip_hash IS NULL OR v_ip_hash = '' THEN
      v_ip_hash := 'unknown';
    ELSE
      -- Use the first IP if there's a chain
      v_ip_hash := split_part(v_ip_hash, ',', 1);
    END IF;

    SELECT count(*) INTO v_recent_calls
    FROM public.preview_invite_calls
    WHERE ip_hash = v_ip_hash
    AND called_at > now() - interval '60 seconds';

    IF v_recent_calls >= 20 THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'rate_limited');
    END IF;

    INSERT INTO public.preview_invite_calls (ip_hash) VALUES (v_ip_hash);
    DELETE FROM public.preview_invite_calls
    WHERE ip_hash = v_ip_hash
    AND called_at < now() - interval '5 minutes';
  END IF;

  -- Auto-clear stale pending requests (>30 min old) from any user
  UPDATE public.couples
  SET pending_partner_id     = NULL,
      pending_partner_status = NULL,
      pending_requested_at   = NULL
  WHERE user_b_id IS NULL
  AND pending_partner_id IS NOT NULL
  AND pending_requested_at IS NOT NULL
  AND pending_requested_at < now() - interval '30 minutes';

  -- Look up the inviter, returning only minimal info
  SELECT c.id, p.first_name, p.last_name, p.avatar_url
  INTO v_couple_id, v_inviter_first, v_inviter_last, v_inviter_avatar
  FROM public.couples c
  JOIN public.profiles p ON p.id = c.user_a_id
  WHERE c.invite_code = preview_invite.invite_code
  AND c.user_b_id IS NULL
  LIMIT 1;

  IF v_couple_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  -- Return first name + last initial only (e.g. "Sarah W.")
  RETURN jsonb_build_object(
    'ok',             true,
    'couple_id',      v_couple_id,
    'inviter_name',   CASE
                        WHEN v_inviter_last IS NOT NULL AND length(v_inviter_last) > 0
                        THEN v_inviter_first || ' ' || substr(v_inviter_last, 1, 1) || '.'
                        ELSE v_inviter_first
                      END,
    'inviter_avatar', v_inviter_avatar
  );
END;
$$;

-- Grant execute to both anon and authenticated
GRANT EXECUTE ON FUNCTION public.preview_invite(text) TO anon;
GRANT EXECUTE ON FUNCTION public.preview_invite(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
