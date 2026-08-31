/*
  # Fix: Revoke EXECUTE from PUBLIC on SECURITY DEFINER Functions

  ## Purpose
  The previous migration (20260805140000) revoked EXECUTE from the `anon` role
  directly, but `anon` inherits from `PUBLIC`, and all new functions get
  `EXECUTE` granted to `PUBLIC` by default. Revoking from `anon` does not
  override the inherited `PUBLIC` grant. This migration fixes that by:

  1. Revoking EXECUTE from PUBLIC on all SECURITY DEFINER functions.
  2. Re-granting EXECUTE to `authenticated` on user-facing functions only.

  ## Changes

  ### Revoke EXECUTE FROM PUBLIC on all SECURITY DEFINER functions
  This removes the default grant that makes every function callable by
  anonymous users. After this, only roles with an explicit grant can call
  these functions.

  ### Re-grant EXECUTE TO authenticated on user-facing functions
  These functions are needed by signed-in app users:
  - accept_partner, decline_partner, cancel_request
  - get_my_pending_join, get_pending_partner_profile, preview_invite
  - generate_invite_code (both overloads), request_join
  - is_current_user_admin, is_super_admin
  - mark_vault_item_viewed, user_has_premium_access

  ### Functions left with NO EXECUTE grant (service role only)
  These are only called from edge functions or triggers, never by app users:
  - admin_search_user_by_email, admin_set_global_debug_access
  - debug_database_identity, get_global_debug_status
  - validate_debug_support_code, record_trial_expired_notification
  - sync_chat_messages_burns_at
  - handle_new_user, handle_new_profile_subscription
  - migrate_solo_prompts_to_couple, protect_profile_admin_flags
  - clear_invite_code_on_join

  Note: get_day_streak is SECURITY INVOKER (not DEFINER) so it does not
  need its PUBLIC grant revoked — it runs as the caller, not the owner,
  so it is safe. But we revoke it from PUBLIC anyway and re-grant to
  authenticated + anon since it is used by the app for streak display.

  ## Important Notes
  - The service_role always has EXECUTE (it bypasses all grants).
  - Trigger functions do not need EXECUTE grants to fire as triggers.
  - This migration is safe to re-run (REVOKE is idempotent).
*/

-- ═══════════════════════════════════════════════════════════════
-- 1. Revoke EXECUTE FROM PUBLIC on ALL functions in public schema
-- ═══════════════════════════════════════════════════════════════

REVOKE EXECUTE ON FUNCTION public.accept_partner() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.decline_partner() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cancel_request() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.clear_invite_code_on_join() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_my_pending_join() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_pending_partner_profile() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.preview_invite(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_profile_subscription() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.migrate_solo_prompts_to_couple() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.protect_profile_admin_flags() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_trial_expired_notification(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sync_chat_messages_burns_at() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.debug_database_identity() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_global_debug_status() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.validate_debug_support_code(text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_search_user_by_email(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_set_global_debug_access(boolean, text, timestamptz, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_invite_code() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_invite_code(boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_couple_by_invite_code(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_day_streak(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_current_user_admin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_super_admin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mark_vault_item_viewed(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.request_join(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.user_has_premium_access(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.protect_couple_membership() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.protect_chat_message_content() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.protect_profile_admin_flags_on_insert() FROM PUBLIC;

-- ═══════════════════════════════════════════════════════════════
-- 2. Re-grant EXECUTE TO authenticated on user-facing functions
-- ═══════════════════════════════════════════════════════════════

GRANT EXECUTE ON FUNCTION public.accept_partner() TO authenticated;
GRANT EXECUTE ON FUNCTION public.decline_partner() TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_request() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_pending_join() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_pending_partner_profile() TO authenticated;
GRANT EXECUTE ON FUNCTION public.preview_invite(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_invite_code() TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_invite_code(boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_join(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_current_user_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_vault_item_viewed(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_premium_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_day_streak(uuid, text) TO authenticated;

-- ═══════════════════════════════════════════════════════════════
-- 3. Grant EXECUTE TO anon on get_day_streak (used for streak display
--    before sign-in completes; SECURITY INVOKER so safe)
-- ═══════════════════════════════════════════════════════════════

GRANT EXECUTE ON FUNCTION public.get_day_streak(uuid, text) TO anon;

-- ═══════════════════════════════════════════════════════════════
-- 4. Fix storage.objects: revoke SELECT from anon
-- ═══════════════════════════════════════════════════════════════
-- The previous migration revoked all privileges from anon on storage.objects,
-- but Supabase's storage module re-grants SELECT to anon internally.
-- We need to revoke it again and ensure it stays revoked.

REVOKE SELECT ON storage.objects FROM anon;
