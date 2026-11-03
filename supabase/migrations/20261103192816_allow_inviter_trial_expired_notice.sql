-- The inviter (solo couple with a pending join request) must be able to record that
-- their trial-expired notice was shown. Direct updates to couples are not permitted
-- for signed-in users, so this goes through the existing function.

CREATE OR REPLACE FUNCTION public.record_trial_expired_notification(p_couple_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id   uuid;
  v_is_first  boolean;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'P0001';
  END IF;

  -- Allowed callers: the pending partner, or the inviter while a join request is pending.
  IF NOT EXISTS (
    SELECT 1 FROM public.couples
    WHERE id = p_couple_id
      AND user_b_id IS NULL
      AND (
        pending_partner_id = v_user_id
        OR (user_a_id = v_user_id AND pending_partner_status IS NOT NULL)
      )
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authorized');
  END IF;

  SELECT trial_expired_notified_at IS NULL
  INTO v_is_first
  FROM public.couples
  WHERE id = p_couple_id;

  IF v_is_first THEN
    UPDATE public.couples
    SET trial_expired_notified_at = now()
    WHERE id = p_couple_id;
    RETURN jsonb_build_object('ok', true, 'is_first', true);
  END IF;

  RETURN jsonb_build_object('ok', true, 'is_first', false);
END;
$function$;

NOTIFY pgrst, 'reload schema';
