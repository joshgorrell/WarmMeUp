/*
  # Remove broken partner_request trigger

  The previous migration created a trigger that inserted into a
  `notifications` table that does not exist in this project. This drops
  the trigger and function to avoid errors on every couples UPDATE.

  Partner-request notifications are handled client-side: when User B
  calls `request_join`, the client also calls the `notify-partner` edge
  function to send User A a push notification. User A's pair screen
  detects the pending state via realtime subscription on the couples row.
*/

DROP TRIGGER IF EXISTS on_couples_pending_request ON public.couples;
DROP FUNCTION IF EXISTS public.notify_partner_request();

NOTIFY pgrst, 'reload schema';
