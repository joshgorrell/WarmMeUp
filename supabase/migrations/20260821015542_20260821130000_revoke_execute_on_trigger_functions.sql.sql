/*
# Revoke direct EXECUTE on engagement trigger functions

## Purpose
The trigger functions created in the previous migration are SECURITY DEFINER and
were callable via the REST API by anon/authenticated roles. These functions are only
meant to be invoked by database triggers, not called directly. This migration
revokes EXECUTE from public, anon, and authenticated roles so they cannot be called
via /rest/v1/rpc/.

## Functions affected
- log_subscription_event()
- log_chat_engagement()
- log_interaction_engagement()
- log_vault_engagement()
- log_wish_engagement()
- log_settings_engagement()

## Security
- REVOKE EXECUTE FROM PUBLIC, anon, authenticated on all six functions
- Triggers still work because they run as the table owner, not as a role
*/

REVOKE EXECUTE ON FUNCTION log_subscription_event() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION log_chat_engagement() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION log_interaction_engagement() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION log_vault_engagement() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION log_wish_engagement() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION log_settings_engagement() FROM PUBLIC, anon, authenticated;
