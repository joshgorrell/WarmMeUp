/*
# Lock admin content access to aggregate-only statistics

1. Purpose
- Remove broad administrator read access from private interaction and wish rows.
- Preserve the ability to view engagement statistics without exposing user-written content.

2. New Functions
- `admin_interaction_stats(p_from, p_to)` returns only couple ID, interaction type, status, and a count.
- `admin_wish_stats(p_from, p_to)` returns only couple ID and a wish count.
- `admin_chat_stats(p_from, p_to)` returns only couple ID and a message count.

3. Security
- Each function is `SECURITY DEFINER` with a fixed `public` search path.
- Each function checks that the caller is an administrator before reading private tables.
- Anonymous callers cannot execute these functions.
- Existing admin SELECT policies on `interactions` and `wishes` are removed, so administrators cannot query their content columns through the Data API.
- Existing couple-member policies remain unchanged, so users and their partners retain normal access to their own content.

4. Important Notes
- The returned results contain aggregate counts only; no message text, answers, prompts, wish descriptions, media paths, or media URLs are returned.
- Date bounds are optional and inclusive when supplied.
*/

DROP POLICY IF EXISTS "Admins can read all interactions" ON public.interactions;
DROP POLICY IF EXISTS "Admins can read all wishes" ON public.wishes;

CREATE OR REPLACE FUNCTION public.admin_interaction_stats(
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL
)
RETURNS TABLE (
  couple_id uuid,
  type text,
  status text,
  interaction_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.is_current_user_admin() OR public.is_super_admin()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT i.couple_id, i.type, i.status, COUNT(*)::bigint
  FROM public.interactions AS i
  WHERE (p_from IS NULL OR i.created_at >= p_from)
    AND (p_to IS NULL OR i.created_at <= p_to)
  GROUP BY i.couple_id, i.type, i.status;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_wish_stats(
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL
)
RETURNS TABLE (
  couple_id uuid,
  wish_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.is_current_user_admin() OR public.is_super_admin()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT w.couple_id, COUNT(*)::bigint
  FROM public.wishes AS w
  WHERE (p_from IS NULL OR w.created_at >= p_from)
    AND (p_to IS NULL OR w.created_at <= p_to)
  GROUP BY w.couple_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_chat_stats(
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL
)
RETURNS TABLE (
  couple_id uuid,
  message_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.is_current_user_admin() OR public.is_super_admin()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT c.couple_id, COUNT(*)::bigint
  FROM public.chat_messages AS c
  WHERE (p_from IS NULL OR c.created_at >= p_from)
    AND (p_to IS NULL OR c.created_at <= p_to)
  GROUP BY c.couple_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_interaction_stats(timestamptz, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_wish_stats(timestamptz, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_chat_stats(timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_interaction_stats(timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_wish_stats(timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_chat_stats(timestamptz, timestamptz) TO authenticated;
