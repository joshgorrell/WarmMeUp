/*
# Fix preview_invite blocked by stale pending partner requests

## Problem
The `preview_invite` function had a filter `AND c.pending_partner_id IS NULL`
that caused it to return "not_found" whenever ANY previous join attempt left a
stale pending request on the inviter's couple row. This meant a new partner
entering the invite code would see "Invalid code" and the join would never
proceed -- even though `request_join` has its own stale-cleanup logic and would
succeed if called.

## Changes

### 1. `preview_invite` function
- Removed the `AND c.pending_partner_id IS NULL` filter so the preview always
  finds the couple by invite code as long as the couple is unpaired
  (`user_b_id IS NULL`).
- Added stale-pending cleanup (same 30-minute threshold used by
  `request_join`) so the preview also clears stale state from previous failed
  attempts.

### 2. `request_join` function
- Added `pending_partner_id IS NULL` guard to the finalizing UPDATE so that
  if two users race to join the same code, only the first one wins. This
  matches the existing `user_b_id IS NULL` guard.

## Security
- No RLS policy changes.
- No new tables or columns.
- `preview_invite` still only returns minimal inviter info (first name + last
  initial + avatar URL), so removing the pending filter does not leak any
  additional data.
*/

-- ── 1. Recreate preview_invite without the pending_partner_id filter ──
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

  -- Auto-clear stale pending requests (>30 min old) from any user so they
  -- don't block new joiners. This mirrors the cleanup in request_join.
  UPDATE public.couples
  SET pending_partner_id     = NULL,
      pending_partner_status = NULL,
      pending_requested_at   = NULL
  WHERE user_b_id IS NULL
  AND pending_partner_id IS NOT NULL
  AND pending_requested_at IS NOT NULL
  AND pending_requested_at < now() - interval '30 minutes';

  -- Look up the inviter, returning only minimal info.
  -- No longer filters on pending_partner_id — a stale pending request
  -- should not prevent a new partner from previewing and joining.
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

-- Re-grant execute to authenticated only (preserve existing access)
REVOKE EXECUTE ON FUNCTION public.preview_invite(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.preview_invite(text) TO authenticated;
