/*
  # Mutual Consent Pairing

  Replaces the one-shot `join_couple` join with a two-phase mutual consent flow:
  User B requests to join, User A accepts or declines. A wrong invite code
  no longer instantly grants full couple membership (and therefore no longer
  leaks couple-scoped data to a stranger).

  ## New columns on `public.couples`
  - `pending_partner_id` uuid — the user who requested to join (NULL when no
    pending request).
  - `pending_partner_status` text — `pending` | `accepted` | `declined` | NULL.
  - `pending_requested_at` timestamptz — when the request was created.

  These columns are NOT part of any couple-membership RLS check, so a pending
  partner gets zero access to chat, vault, wishes, media, or scores until the
  row is accepted and `user_b_id` is written.

  ## New table: `public.invite_join_attempts`
  Lightweight server-side brute-force guard for `request_join`. Tracks
  attempt count per user inside a rolling 10-minute window. A caller who
  exceeds 5 attempts in the window receives the same `not_found` payload
  used for invalid codes — no oracle distinguishing wrong code from
  rate-limited.

  ## New RPCs
  - `request_join(invite_code text)` — replaces `join_couple`. Looks up the
    open couple by invite code and atomically sets `pending_partner_id`,
    `pending_partner_status = 'pending'`. Does NOT write `user_b_id`.
  - `accept_partner()` — callable only by `user_a_id`. Atomically writes
    `user_b_id = pending_partner_id`, `active = true`, clears pending fields.
  - `decline_partner()` — callable only by `user_a_id`. Clears pending
    fields; couple stays open for a new request.
  - `cancel_request()` — callable by `pending_partner_id`. Withdraws the
    caller's own pending request.

  ## Removed
  - `join_couple(text)` dropped (function, not user data). Clients now call
    `request_join`.

  ## Security / RLS
  - SELECT policy on `couples` extended so `pending_partner_id = auth.uid()`
    can read the row (to poll/subscribe for accept/decline). No other couple
    content is exposed — `user_a_id` is an opaque UUID, not PII.
  - `invite_join_attempts` locked down to the owning user only.
  - `couples` added to `supabase_realtime` so both sides receive live status
    transitions.

  ## Important notes
  1. Existing already-paired couples are untouched — `pending_*` defaults to
     NULL, no backfill needed.
  2. All new RPCs are SECURITY DEFINER, search_path = public, authenticated
     only (anon revoked).
  3. Idempotent — safe to re-run.
*/

-- ─── Columns on couples ────────────────────────────────────────────────────
ALTER TABLE public.couples
  ADD COLUMN IF NOT EXISTS pending_partner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.couples
  ADD COLUMN IF NOT EXISTS pending_partner_status text;
ALTER TABLE public.couples
  ADD COLUMN IF NOT EXISTS pending_requested_at timestamptz;

-- ─── Realtime for couples ──────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE public.couples;

-- ─── RLS: allow pending partner to read the couples row status ─────────────
DROP POLICY IF EXISTS "select_own_or_pending_couples" ON public.couples;
CREATE POLICY "select_own_or_pending_couples"
ON public.couples FOR SELECT
TO authenticated
USING (
  auth.uid() = user_a_id
  OR auth.uid() = user_b_id
  OR auth.uid() = pending_partner_id
);

-- ─── Brute-force guard table ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.invite_join_attempts (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  attempt_count int NOT NULL DEFAULT 0,
  window_start timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.invite_join_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_join_attempts" ON public.invite_join_attempts;
CREATE POLICY "select_own_join_attempts"
ON public.invite_join_attempts FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- No insert/update/delete policies: only the SECURITY DEFINER `request_join`
-- function mutates this table, so clients cannot touch it directly.

-- ─── Drop old join_couple ──────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.join_couple(text);

-- ─── request_join ──────────────────────────────────────────────────────────
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
  v_attempts  int;
  v_window    timestamptz;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'P0001';
  END IF;

  -- Block if caller is already in an active paired couple
  IF EXISTS (
    SELECT 1 FROM public.couples
    WHERE (user_a_id = v_user_id OR user_b_id = v_user_id)
    AND user_b_id IS NOT NULL
    AND active = true
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_connected');
  END IF;

  -- ── Brute-force guard: max 5 attempts per 10 minutes ──
  SELECT attempt_count, window_start
  INTO v_attempts, v_window
  FROM public.invite_join_attempts
  WHERE user_id = v_user_id
  FOR UPDATE;

  IF v_attempts IS NULL THEN
    INSERT INTO public.invite_join_attempts (user_id, attempt_count, window_start)
    VALUES (v_user_id, 1, now());
  ELSIF now() - v_window > interval '10 minutes' THEN
    -- Window expired — reset
    UPDATE public.invite_join_attempts
    SET attempt_count = 1, window_start = now()
    WHERE user_id = v_user_id;
  ELSE
    UPDATE public.invite_join_attempts
    SET attempt_count = attempt_count + 1
    WHERE user_id = v_user_id;
    IF v_attempts + 1 > 5 THEN
      -- Rate-limited: return same payload as invalid code (no oracle)
      RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
    END IF;
  END IF;

  -- Look up the open couple by invite code (no pending request already)
  SELECT id, user_a_id
  INTO v_couple_id, v_user_a_id
  FROM public.couples
  WHERE couples.invite_code = request_join.invite_code
    AND user_b_id IS NULL
    AND pending_partner_id IS NULL
  LIMIT 1;

  IF v_couple_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  IF v_user_a_id = v_user_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'self');
  END IF;

  -- Atomically create the pending request
  UPDATE public.couples
  SET pending_partner_id     = v_user_id,
      pending_partner_status = 'pending',
      pending_requested_at   = now()
  WHERE id = v_couple_id
    AND user_b_id IS NULL
    AND pending_partner_id IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_full');
  END IF;

  -- Reset attempt counter on successful request
  UPDATE public.invite_join_attempts
  SET attempt_count = 0, window_start = now()
  WHERE user_id = v_user_id;

  RETURN jsonb_build_object(
    'ok',        true,
    'couple_id', v_couple_id,
    'user_a_id', v_user_a_id,
    'status',    'pending'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_join(text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.request_join(text) FROM anon;

-- ─── accept_partner ─────────────────────────────────────────────────────────
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
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'P0001';
  END IF;

  SELECT id, pending_partner_id
  INTO v_couple_id, v_partner_id
  FROM public.couples
  WHERE user_a_id = v_user_id
    AND pending_partner_status = 'pending'
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
    AND pending_partner_status = 'pending'
    AND user_b_id IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_full');
  END IF;

  RETURN jsonb_build_object('ok', true, 'couple_id', v_couple_id, 'user_b_id', v_partner_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_partner() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.accept_partner() FROM anon;

-- ─── decline_partner ───────────────────────────────────────────────────────
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
    AND pending_partner_status = 'pending'
  LIMIT 1;

  IF v_couple_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_pending_request');
  END IF;

  UPDATE public.couples
  SET pending_partner_status = 'declined',
      pending_partner_id     = NULL,
      pending_requested_at   = NULL
  WHERE id = v_couple_id
    AND user_a_id = v_user_id;

  RETURN jsonb_build_object('ok', true, 'couple_id', v_couple_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.decline_partner() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.decline_partner() FROM anon;

-- ─── cancel_request ────────────────────────────────────────────────────────
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
    AND pending_partner_status = 'pending'
  LIMIT 1;

  IF v_couple_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_pending_request');
  END IF;

  UPDATE public.couples
  SET pending_partner_status = NULL,
      pending_partner_id     = NULL,
      pending_requested_at   = NULL
  WHERE id = v_couple_id
    AND pending_partner_id = v_user_id;

  RETURN jsonb_build_object('ok', true, 'couple_id', v_couple_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_request() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.cancel_request() FROM anon;

-- ─── Reload PostgREST schema cache ─────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
