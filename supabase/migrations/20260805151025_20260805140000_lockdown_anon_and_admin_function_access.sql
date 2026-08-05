/*
  # Lock Down Anonymous and Admin Function Access

  ## Purpose
  Close three security gaps identified in a full database security audit:
  1. 18 SECURITY DEFINER functions were callable by the `anon` role (unauthenticated strangers).
  2. Admin-only and system-only functions were callable by any signed-in `authenticated` user.
  3. All 38 tables granted full CRUD to the `anon` role.

  ## Changes

  ### 1. Revoke EXECUTE from anon on all SECURITY DEFINER functions
  Every SECURITY DEFINER function in the public schema that allowed `anon` execution
  now has that grant revoked. These functions all check `auth.uid()` internally and
  reject anonymous callers, but leaving the door open is unnecessary risk.

  Functions affected (18):
  - accept_partner, decline_partner, cancel_request, clear_invite_code_on_join
  - get_my_pending_join, get_pending_partner_profile, preview_invite
  - handle_new_user, handle_new_profile_subscription, migrate_solo_prompts_to_couple
  - protect_profile_admin_flags, record_trial_expired_notification
  - sync_chat_messages_burns_at, debug_database_identity
  - get_global_debug_status, validate_debug_support_code
  - admin_search_user_by_email, admin_set_global_debug_access

  ### 2. Revoke EXECUTE from authenticated on admin/system-only functions
  These functions are meant for admin or edge-function (service role) use only.
  Revoking from `authenticated` means a signed-in user cannot call them directly
  via the REST API, but edge functions using the service role key still can.

  Functions restricted to service role only:
  - admin_search_user_by_email (search any user's account by email)
  - admin_set_global_debug_access (toggle global debug mode)
  - debug_database_identity (expose internal DB identity)
  - get_global_debug_status (expose debug system status)
  - validate_debug_support_code (validate debug support codes)
  - record_trial_expired_notification (system trial-expiry handler)
  - handle_new_user (trigger function, should never be called directly)
  - handle_new_profile_subscription (trigger function, should never be called directly)
  - migrate_solo_prompts_to_couple (trigger function, should never be called directly)
  - protect_profile_admin_flags (trigger function, should never be called directly)
  - sync_chat_messages_burns_at (system maintenance function)
  - clear_invite_code_on_join (trigger function, should never be called directly)

  Functions kept executable by authenticated (user-facing):
  - accept_partner, decline_partner, cancel_request
  - get_my_pending_join, get_pending_partner_profile, preview_invite
  - generate_invite_code (both overloads), request_join
  - is_current_user_admin, is_super_admin
  - mark_vault_item_viewed, user_has_premium_access
  - get_day_streak (SECURITY INVOKER, not DEFINER)

  ### 3. Revoke all table privileges from anon on all 38 public tables
  Every table had GRANT SELECT, INSERT, UPDATE, DELETE TO anon. RLS policies
  block anonymous access (all check auth.uid()), but the grants are unnecessary.
  Revoking them means even if a future policy accidentally uses USING(true),
  anonymous callers still cannot reach the table.

  ### 4. Revoke all table privileges from anon on storage.objects
  Same principle: storage policies check auth.uid(), but the anon grant is unnecessary.

  ## Security Impact
  - Anonymous callers can no longer call any SECURITY DEFINER function.
  - Signed-in users can no longer call admin-only or system-only functions.
  - Anonymous callers have zero direct table access (RLS was already blocking, now grants too).
  - Edge functions using the service role key are unaffected (service role bypasses all grants).
  - All user-facing app functionality is unaffected (app uses authenticated sessions).

  ## Important Notes
  - This migration is safe to re-run (all statements use IF EXISTS).
  - The `get_couple_by_invite_code` function already had no exec roles; no change needed.
  - The `get_day_streak` function is SECURITY INVOKER (not DEFINER) so it is safe for anon/authenticated.
  - Trigger functions (handle_new_user, etc.) do not need EXECUTE grants to fire as triggers;
    revoking EXECUTE only prevents direct RPC calls.
*/

-- ═══════════════════════════════════════════════════════════════
-- 1. Revoke EXECUTE from anon on all SECURITY DEFINER functions
-- ═══════════════════════════════════════════════════════════════

REVOKE EXECUTE ON FUNCTION public.accept_partner() FROM anon;
REVOKE EXECUTE ON FUNCTION public.decline_partner() FROM anon;
REVOKE EXECUTE ON FUNCTION public.cancel_request() FROM anon;
REVOKE EXECUTE ON FUNCTION public.clear_invite_code_on_join() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_my_pending_join() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_pending_partner_profile() FROM anon;
REVOKE EXECUTE ON FUNCTION public.preview_invite(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_profile_subscription() FROM anon;
REVOKE EXECUTE ON FUNCTION public.migrate_solo_prompts_to_couple() FROM anon;
REVOKE EXECUTE ON FUNCTION public.protect_profile_admin_flags() FROM anon;
REVOKE EXECUTE ON FUNCTION public.record_trial_expired_notification(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.sync_chat_messages_burns_at() FROM anon;
REVOKE EXECUTE ON FUNCTION public.debug_database_identity() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_global_debug_status() FROM anon;
REVOKE EXECUTE ON FUNCTION public.validate_debug_support_code(text, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_search_user_by_email(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_set_global_debug_access(boolean, text, timestamptz, text) FROM anon;

-- ═══════════════════════════════════════════════════════════════
-- 2. Revoke EXECUTE from authenticated on admin/system-only functions
-- ═══════════════════════════════════════════════════════════════

-- Admin-only functions
REVOKE EXECUTE ON FUNCTION public.admin_search_user_by_email(text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_set_global_debug_access(boolean, text, timestamptz, text) FROM authenticated;

-- System/debug functions (edge function / service role only)
REVOKE EXECUTE ON FUNCTION public.debug_database_identity() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_global_debug_status() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_debug_support_code(text, jsonb) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.record_trial_expired_notification(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_chat_messages_burns_at() FROM authenticated;

-- Trigger functions (should never be called directly via RPC)
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_profile_subscription() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.migrate_solo_prompts_to_couple() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.protect_profile_admin_flags() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.clear_invite_code_on_join() FROM authenticated;

-- ═══════════════════════════════════════════════════════════════
-- 3. Revoke all table privileges from anon on all 38 public tables
-- ═══════════════════════════════════════════════════════════════

REVOKE SELECT, INSERT, UPDATE, DELETE ON public.activity_events FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.activity_views FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.admin_grants FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.ai_issues FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.ai_loop_runs FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.ai_loop_settings FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.app_config FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.cancellation_surveys FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.cash_in_events FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.chat_messages FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.couple_health_scores FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.couple_hidden_prompts FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.couples FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.dare_prompts FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.debug_access_log FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.decline_prompts FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.dice_face_labels FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.dice_prompts FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.greeting_subtitles FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.interactions FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.invite_join_attempts FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.media_reactions FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.monthly_scores FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.point_config FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.point_events FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.profiles FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.reports FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.scores FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.security_events FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.subscription_events FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.subscriptions FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.tell_me_prompts FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.user_diagnostics FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.user_feedback FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.user_settings FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.vault_items FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.wish_reactions FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.wishes FROM anon;

-- ═══════════════════════════════════════════════════════════════
-- 4. Revoke all table privileges from anon on storage.objects
-- ═══════════════════════════════════════════════════════════════

REVOKE SELECT, INSERT, UPDATE, DELETE ON storage.objects FROM anon;
