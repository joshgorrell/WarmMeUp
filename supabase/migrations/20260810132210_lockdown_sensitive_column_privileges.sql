/*
# Lock down sensitive column UPDATE/INSERT privileges

## Problem
The `authenticated` role has table-level UPDATE on `profiles`, `couples`, and
`subscriptions` that includes sensitive columns a user must never control directly:

1. `profiles.is_admin`, `profiles.is_super_admin` — a user could UPDATE their own
   row to set `is_admin = true`, escalating themselves to admin. The existing RLS
   policy "Users can update own profile" checks row ownership but not column-level
   access, so this is exploitable via the REST API.

2. `couples.user_a_id`, `couples.user_b_id`, `couples.subscription_owner_id`,
   `couples.pending_partner_id`, `couples.pending_partner_status`,
   `couples.pending_requested_at`, `couples.invite_code`,
   `couples.invite_code_expires_at`, `couples.invite_code_used_at`,
   `couples.trial_expired_notified_at`, `couples.trial_expired_reminder_sent`,
   `couples.admin_notes` — a user could directly set `user_b_id` to pair without
   the mutual-consent handshake, or change `subscription_owner_id` to gain
   partner-shared premium.

3. `subscriptions` — `authenticated` has INSERT and UPDATE. Although RLS policies
   restrict these to `service_role`, the table-level grant is a defense-in-depth gap.

## Solution
1. Revoke table-level UPDATE on `profiles` from `authenticated`.
   Grant column-level UPDATE only on user-controlled columns:
   `display_name, avatar_url, first_name, last_name, push_token, tos_accepted_at, oauth_provider`.
   Admin privilege changes go through SECURITY DEFINER functions or admin edge functions
   that use the service role key.

2. Revoke table-level UPDATE on `couples` from `authenticated`.
   Grant column-level UPDATE only on user-controlled columns:
   `active, points_enabled, streaks_enabled, disconnected_at, updated_at, anniversary_date`.
   All pairing handshake and subscription-stamping changes go through the existing
   SECURITY DEFINER RPC functions (accept_partner, decline_partner, request_join, etc.).

3. Revoke INSERT and UPDATE on `subscriptions` from `authenticated`.
   Only `service_role` (used by edge functions) needs these.

## Security
- No RLS policy changes. These are GRANT-level restrictions that add defense-in-depth
  on top of the existing RLS policies.
- All sensitive column writes remain possible through SECURITY DEFINER functions
  (which run as their creator, typically bypassing RLS) and the service role.
- Idempotent: safe to re-run.
*/

-- ─── 1. Profiles: restrict UPDATE to user-controlled columns ───────────────
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (display_name, avatar_url, first_name, last_name, push_token, tos_accepted_at, oauth_provider)
  ON public.profiles TO authenticated;

-- ─── 2. Couples: restrict UPDATE to user-controlled columns ─────────────────
REVOKE UPDATE ON public.couples FROM authenticated;
GRANT UPDATE (active, points_enabled, streaks_enabled, disconnected_at, updated_at, anniversary_date)
  ON public.couples TO authenticated;

-- ─── 3. Subscriptions: revoke INSERT and UPDATE from authenticated ─────────
REVOKE INSERT, UPDATE ON public.subscriptions FROM authenticated;
