/*
  # Notify User A on pending partner request

  Adds a trigger that fires after a `couples` row transitions to
  `pending_partner_status = 'pending'`. The trigger inserts a row into
  `public.notifications` so User A sees an in-app notification, and the
  existing notify-partner edge function (called from the client or a
  future webhook) can send a push.

  ## Changes
  - Adds `notify_partner_request()` trigger function.
  - Adds trigger `on_couples_pending_request` AFTER UPDATE on `couples`.
  - Only fires when `pending_partner_status` goes from NULL/other to 'pending'.

  ## Security
  - SECURITY DEFINER, search_path = public.
  - Idempotent — safe to re-run.
*/

CREATE OR REPLACE FUNCTION public.notify_partner_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  -- Only fire when a NEW pending request is created
  IF NEW.pending_partner_status = 'pending'
     AND (OLD.pending_partner_status IS DISTINCT FROM 'pending')
     AND NEW.user_a_id IS NOT NULL
     AND NEW.pending_partner_id IS NOT NULL THEN

    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (
      NEW.user_a_id,
      'partner_request',
      'Connection request',
      'Someone wants to connect with you. Open to confirm.',
      jsonb_build_object('couple_id', NEW.id, 'event_type', 'partner_request')
    )
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_couples_pending_request ON public.couples;
CREATE TRIGGER on_couples_pending_request
AFTER UPDATE ON public.couples
FOR EACH ROW
EXECUTE FUNCTION public.notify_partner_request();

NOTIFY pgrst, 'reload schema';
