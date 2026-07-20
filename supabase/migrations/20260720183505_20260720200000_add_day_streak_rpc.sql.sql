/*
# Add server-side day streak calculation RPC

## Purpose
Replaces the client-side streak calculation in the Home tab that previously
fetched up to 400 rows (200 interactions + 200 chat_messages) and computed
the streak in JavaScript on every tab focus. This RPC computes the streak
server-side in a single round-trip, returning only an integer.

## Streak definition
A day counts toward the streak ONLY when BOTH partners in the couple had at
least one activity (an interaction row or a chat message) on that calendar
day. The streak is the count of consecutive such days ending today (or the
most recent day with mutual activity). If today has no mutual activity yet,
the streak is 0 — matching the previous client-side behavior.

## Parameters
- `p_couple_id uuid` — the couple whose streak to compute.
- `p_tz text` (default 'UTC') — IANA timezone name (e.g. 'America/Los_Angeles')
  used to determine calendar-day boundaries so the result matches the user's
  local day, not UTC. The client passes its device timezone.

## Security
- Function is SECURITY INVOKER, so RLS on `interactions`, `chat_messages`,
  and `couples` applies to the calling authenticated user. A user can only
  compute the streak for a couple they belong to (the couples SELECT policy
  restricts to user_a_id / user_b_id).
- Execute granted to `authenticated` only.

## Notes
- Both partners are typically in the same timezone (couples app), so even
  with a UTC fallback the relative day comparison is consistent.
- Only non-deleted rows (deleted_at IS NULL) are counted.
- Idempotent: uses CREATE OR REPLACE and DROP POLICY-free GRANT.
*/

CREATE OR REPLACE FUNCTION get_day_streak(p_couple_id uuid, p_tz text DEFAULT 'UTC')
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_user_a uuid;
  v_user_b uuid;
  v_both_days date[];
  v_d date;
  v_count integer := 0;
BEGIN
  SELECT user_a_id, user_b_id INTO v_user_a, v_user_b
  FROM couples WHERE id = p_couple_id;

  IF v_user_a IS NULL OR v_user_b IS NULL THEN
    RETURN 0;
  END IF;

  -- Days where BOTH partners had at least one interaction or chat message.
  -- Each partner's active days are computed in the given timezone, then
  -- intersected so only mutual-activity days remain.
  SELECT ARRAY(
    SELECT d FROM (
      SELECT (created_at AT TIME ZONE p_tz)::date AS d
      FROM interactions
      WHERE couple_id = p_couple_id AND deleted_at IS NULL AND sender_id = v_user_a
      UNION
      SELECT (created_at AT TIME ZONE p_tz)::date AS d
      FROM chat_messages
      WHERE couple_id = p_couple_id AND deleted_at IS NULL AND sender_id = v_user_a
    ) AS a
    INTERSECT
    SELECT d FROM (
      SELECT (created_at AT TIME ZONE p_tz)::date AS d
      FROM interactions
      WHERE couple_id = p_couple_id AND deleted_at IS NULL AND sender_id = v_user_b
      UNION
      SELECT (created_at AT TIME ZONE p_tz)::date AS d
      FROM chat_messages
      WHERE couple_id = p_couple_id AND deleted_at IS NULL AND sender_id = v_user_b
    ) AS b
  ) INTO v_both_days;

  -- Count consecutive mutual-activity days ending today (in the given tz).
  v_d := (now() AT TIME ZONE p_tz)::date;
  WHILE v_d = ANY(v_both_days) LOOP
    v_count := v_count + 1;
    v_d := v_d - 1;
  END LOOP;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION get_day_streak(uuid, text) TO authenticated;
