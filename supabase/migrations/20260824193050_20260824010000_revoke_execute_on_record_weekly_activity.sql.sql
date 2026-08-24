/*
# Revoke direct execute on record_weekly_activity trigger function

The trigger function `public.record_weekly_activity()` is SECURITY DEFINER and
was callable by anon/public via the REST API by default. It is only meant to be
invoked by AFTER INSERT triggers on interactions, chat_messages, vault_items,
and activity_events. Revoke EXECUTE from anon and public so it cannot be
called directly, while keeping it callable by the trigger mechanism (triggers
run with the function's own privileges regardless of caller grants).
*/

REVOKE EXECUTE ON FUNCTION public.record_weekly_activity() FROM PUBLIC, anon;
