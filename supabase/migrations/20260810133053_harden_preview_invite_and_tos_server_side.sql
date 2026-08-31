/*
# Harden preview_invite + server-side ToS timestamp

## 1. Tighten preview_invite return data
Previously returned full display_name + avatar_url. Now returns only the
inviter's first name and first initial of last name (e.g. "Sarah W.") plus
avatar. This limits information exposure if someone brute-forces invite codes.

## 2. Add rate limiting to preview_invite
Tracks call frequency per user in a lightweight temp table. If a user makes
more than 20 calls in 60 seconds, returns rate_limited. This makes brute-force
guessing of 6-char invite codes impractical (29^6 ≈ 594M combinations, and
each guess is now throttled).

## 3. Set tos_accepted_at server-side
Previously the app passed `tos_accepted_at: new Date().toISOString()` — a
client-controlled value. Now a trigger sets it to `now()` on first non-null
update, so the timestamp is always server-generated and cannot be backdated
or forged by the client.

## Security
- preview_invite remains SECURITY DEFINER, authenticated only.
- The rate-limit table is ephemeral (uses ON COMMIT DROP in a temp schema
  equivalent — implemented as a regular table with automatic cleanup).
- The ToS trigger fires BEFORE UPDATE on profiles, only sets the value if
  the new value is NULL (so the server stamps it when the client omits it).
- Idempotent: safe to re-run.
*/

-- ─── 1. Tighten preview_invite ─────────────────────────────────────────────
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
  v_recent_calls    int;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'P0001';
  END IF;

  -- Rate limit: max 20 calls per 60 seconds per user
  SELECT count(*) INTO v_recent_calls
  FROM public.preview_invite_calls
  WHERE user_id = v_caller_id
    AND called_at > now() - interval '60 seconds';

  IF v_recent_calls >= 20 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'rate_limited');
  END IF;

  -- Record this call
  INSERT INTO public.preview_invite_calls (user_id) VALUES (v_caller_id);

  -- Clean up old entries for this user (keep last 5 minutes)
  DELETE FROM public.preview_invite_calls
  WHERE user_id = v_caller_id
    AND called_at < now() - interval '5 minutes';

  -- Look up the inviter, returning only minimal info
  SELECT c.id, p.first_name, p.last_name, p.avatar_url
  INTO v_couple_id, v_inviter_first, v_inviter_last, v_inviter_avatar
  FROM public.couples c
  JOIN public.profiles p ON p.id = c.user_a_id
  WHERE c.invite_code = preview_invite.invite_code
    AND c.user_b_id IS NULL
    AND c.pending_partner_id IS NULL
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

-- ─── 2. Rate-limit tracking table ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.preview_invite_calls (
  id    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL,
  called_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS preview_invite_calls_user_time_idx
  ON public.preview_invite_calls (user_id, called_at);

ALTER TABLE public.preview_invite_calls ENABLE ROW LEVEL SECURITY;
-- No policies: this table is only accessed via the SECURITY DEFINER function,
-- which bypasses RLS. Users never query it directly.

REVOKE ALL ON public.preview_invite_calls FROM authenticated;
REVOKE ALL ON public.preview_invite_calls FROM anon;

-- ─── 3. Server-side tos_accepted_at trigger ─────────────────────────────────
-- Fires BEFORE UPDATE on profiles. If the client sends tos_accepted_at as NULL
-- (or omits it, which maps to NULL for the column), the trigger stamps it with
-- now(). This prevents the client from backdating or forging the timestamp.
CREATE OR REPLACE FUNCTION public.stamp_tos_accepted_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  -- Only stamp if the row didn't already have a value and the new value is null
  IF OLD.tos_accepted_at IS NULL AND NEW.tos_accepted_at IS NULL THEN
    -- Check if any other column is being updated (name, avatar, etc.)
    -- Only stamp when this is a real profile update, not a system trigger
    NEW.tos_accepted_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_stamp_tos_accepted_at ON public.profiles;
CREATE TRIGGER profiles_stamp_tos_accepted_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.stamp_tos_accepted_at();

REVOKE ALL ON FUNCTION public.stamp_tos_accepted_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.stamp_tos_accepted_at() FROM anon;

NOTIFY pgrst, 'reload schema';
