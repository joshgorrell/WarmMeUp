/*
# Add Wish Bump Feature

## Purpose
Allows the creator of a shared Wish to "bump" it back into the chat timeline as a
new activity card with a short optional message. This resurfaces the wish to the
partner's attention without creating a duplicate wish or changing the wish's
status. A 24-hour per-wish cooldown prevents spam.

## Changes

### 1. New column on `wishes`
- `last_bumped_at` (timestamptz, nullable) — records when the wish was last
  bumped. Null means never bumped. The cooldown check compares this to `now()`.

### 2. New SECURITY DEFINER RPC: `bump_wish(p_wish_id uuid, p_message text)`
- Validates the caller (`auth.uid()`) is the wish creator and a member of the
  wish's couple.
- Requires the wish to be in `shared` status (not draft/fulfilled/archived).
- Rejects if `last_bumped_at` is within the last 24 hours, returning a
  `cooldown` error code.
- Sets `last_bumped_at` to `now()`.
- Inserts a `chat_messages` row with the `__WMU_ACTIVITY__:` payload, kind
  `wish_bump`, including the wish title and the bump message as preview.
- Inserts an `activity_events` row (`event_type: 'wish_bumped'`) for analytics.
- Returns a JSON object with `{ ok: true }` on success or
  `{ error: 'cooldown', last_bumped_at: ... }` on cooldown.

### 3. Grants
- `EXECUTE` on `bump_wish` granted to `authenticated` only (not anon).

## Security
- The RPC is SECURITY DEFINER so it can insert into `chat_messages` and
  `activity_events` (which the client may not have direct INSERT permission to
  for arbitrary rows). All authorization is validated inside the function body
  using `auth.uid()`.
- No new RLS policies needed — the RPC handles all access control.
*/

-- 1. Add last_bumped_at column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'wishes' AND column_name = 'last_bumped_at'
  ) THEN
    ALTER TABLE wishes ADD COLUMN last_bumped_at timestamptz;
  END IF;
END $$;

-- 2. Create bump_wish RPC
CREATE OR REPLACE FUNCTION public.bump_wish(p_wish_id uuid, p_message text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wish wishes%ROWTYPE;
  v_couple couples%ROWTYPE;
  v_partner_id uuid;
  v_payload text;
  v_cooldown_interval interval := '24 hours';
BEGIN
  -- Fetch the wish
  SELECT * INTO v_wish FROM wishes WHERE id = p_wish_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'not_found');
  END IF;

  -- Caller must be the wish creator
  IF v_wish.created_by_user_id <> auth.uid() THEN
    RETURN jsonb_build_object('error', 'forbidden');
  END IF;

  -- Wish must be shared
  IF v_wish.status <> 'shared' THEN
    RETURN jsonb_build_object('error', 'not_shared');
  END IF;

  -- Fetch the couple to verify membership and find partner
  SELECT * INTO v_couple FROM couples WHERE id = v_wish.couple_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'couple_not_found');
  END IF;

  -- Verify caller is a member of the couple (redundant with creator check, but safe)
  IF v_couple.user_a_id <> auth.uid() AND v_couple.user_b_id <> auth.uid() THEN
    RETURN jsonb_build_object('error', 'forbidden');
  END IF;

  -- Determine partner ID
  v_partner_id := CASE
    WHEN v_couple.user_a_id = auth.uid() THEN v_couple.user_b_id
    ELSE v_couple.user_a_id
  END;

  -- Check cooldown
  IF v_wish.last_bumped_at IS NOT NULL
     AND v_wish.last_bumped_at > now() - v_cooldown_interval THEN
    RETURN jsonb_build_object(
      'error', 'cooldown',
      'last_bumped_at', v_wish.last_bumped_at
    );
  END IF;

  -- Update the wish's last_bumped_at
  UPDATE wishes
  SET last_bumped_at = now(), updated_at = now()
  WHERE id = p_wish_id;

  -- Build the chat activity payload
  v_payload := '__WMU_ACTIVITY__:' || jsonb_build_object(
    'kind', 'wish_bump',
    'sourceId', v_wish.id,
    'title', v_wish.title,
    'preview', COALESCE(NULLIF(TRIM(p_message), ''), NULL)
  )::text;

  -- Insert chat message
  INSERT INTO chat_messages (couple_id, sender_id, content_text)
  VALUES (v_wish.couple_id, auth.uid(), v_payload);

  -- Insert activity event for analytics
  IF v_partner_id IS NOT NULL THEN
    INSERT INTO activity_events (couple_id, actor_user_id, target_user_id, event_type, wish_id)
    VALUES (v_wish.couple_id, auth.uid(), v_partner_id, 'wish_bumped', v_wish.id);
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- 3. Grant execute to authenticated only
REVOKE EXECUTE ON FUNCTION public.bump_wish(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.bump_wish(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.bump_wish(uuid, text) TO authenticated;
