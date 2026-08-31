/*
  # Narrow Column-Level UPDATE on Profiles and Couples

  ## Purpose
  Add a second layer of defense beyond the existing triggers by revoking
  UPDATE on sensitive columns that users should never be able to modify
  directly through the REST API.

  ## Changes

  ### 1. Profiles: Revoke UPDATE on sensitive columns from authenticated
  Currently the `authenticated` role can UPDATE every column on `profiles`,
  including `is_admin`, `is_super_admin`, and `id`. While database triggers
  (`protect_profile_admin_flags`, `protect_profile_admin_flags_on_insert`)
  prevent the admin flags from being changed by non-admins, column-level
  privileges are checked BEFORE triggers run. Revoking UPDATE on these
  columns adds defense-in-depth.

  Revoked columns:
  - `id` (primary key, should never change)
  - `is_admin` (admin flag, controlled by trigger + super-admin function)
  - `is_super_admin` (super-admin flag, controlled by trigger + super-admin function)

  Retained columns (user-editable):
  - `display_name`, `avatar_url`, `push_token`, `first_name`, `last_name`,
    `tos_accepted_at`, `oauth_provider`, `created_at`

  ### 2. Couples: Revoke UPDATE on sensitive membership columns from authenticated
  Currently the `authenticated` role can UPDATE every column on `couples`,
  including `user_a_id`, `user_b_id`, `pending_partner_id`, `invite_code`,
  `subscription_owner_id`, and `active`. The `protect_couple_membership`
  trigger blocks direct changes to these columns, but column-level revocation
  adds a second defense layer.

  Revoked columns:
  - `user_a_id` (couple creator, must never change)
  - `user_b_id` (partner, only set via pairing RPC functions)
  - `pending_partner_id` (pending partner, only set via pairing RPC functions)
  - `pending_partner_status` (pairing status, only set via pairing RPC functions)
  - `pending_requested_at` (pairing timestamp, only set via pairing RPC functions)
  - `invite_code` (invite code, only generated via RPC)
  - `invite_code_expires_at` (invite expiry, only set via RPC)
  - `invite_code_used_at` (invite usage timestamp, only set via RPC)
  - `subscription_owner_id` (subscription owner, only set via RPC)
  - `trial_expired_notified_at` (system field, only set by edge function)
  - `trial_expired_reminder_sent` (system field, only set by edge function)
  - `admin_notes` (admin-only field)

  Retained columns (user-editable):
  - `active`, `points_enabled`, `streaks_enabled`, `anniversary_date`,
    `disconnected_at`, `updated_at`, `created_at`

  ## Security Impact
  - Even if a database trigger is somehow bypassed, the sensitive columns
    on profiles and couples cannot be modified by authenticated users.
  - The `protect_profile_admin_flags` and `protect_couple_membership` triggers
    remain as the first layer of defense.
  - Edge functions using the service role key are unaffected (service role
    bypasses all grants).
  - All user-facing app functionality is unaffected: users can still update
    their display name, avatar, push token, anniversary date, and toggle
    points/streaks on their couple.

  ## Important Notes
  - Column-level privileges are checked BEFORE RLS policies and BEFORE triggers.
  - The `id` column on profiles is also revoked from INSERT (it defaults to
    `auth.uid()` via the RLS policy WITH CHECK, not via a column grant).
  - This migration is safe to re-run (REVOKE is idempotent).
*/

-- ═══════════════════════════════════════════════════════════════
-- 1. Profiles: Revoke UPDATE on sensitive columns
-- ═══════════════════════════════════════════════════════════════

REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (
  display_name,
  avatar_url,
  push_token,
  first_name,
  last_name,
  tos_accepted_at,
  oauth_provider
) ON public.profiles TO authenticated;

-- ═══════════════════════════════════════════════════════════════
-- 2. Couples: Revoke UPDATE on sensitive membership columns
-- ═══════════════════════════════════════════════════════════════

REVOKE UPDATE ON public.couples FROM authenticated;
GRANT UPDATE (
  active,
  points_enabled,
  streaks_enabled,
  anniversary_date,
  disconnected_at,
  updated_at
) ON public.couples TO authenticated;
