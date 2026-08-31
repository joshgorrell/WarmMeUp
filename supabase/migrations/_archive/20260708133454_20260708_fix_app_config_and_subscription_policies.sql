/*
# Fix app_config UPDATE policy + subscription service_role policy

## Changes

### 1. app_config UPDATE policy
The original "Admins can update app_config" policy checked only `is_admin = true`,
which excluded super admins (is_super_admin = true). The is_current_user_admin() helper
function was updated in migration 20260527191735 to include both flags, but app_config
was not updated at that time.

This migration drops the old inline policy and recreates it using is_current_user_admin()
so both admins and super admins can update app_config keys (e.g. debug_mode_enabled).

Also adds an INSERT policy for admins so the aiops_signup_alert key (and any future
config keys) can be written from edge functions as service_role and from admin users.

### 2. Subscription service_role policy
The original "Service role can upsert subscriptions" policy used FOR ALL, which
inadvertently granted the service role permission to DELETE subscription rows — a
privilege it should never have. This fix replaces it with separate INSERT and UPDATE
policies, removing DELETE access.

## Security
- app_config: admins and super admins can now both update config keys
- subscriptions: service role retains INSERT and UPDATE but loses DELETE
*/

-- ── app_config: fix UPDATE policy to include super admins ─────────────────────

DROP POLICY IF EXISTS "Admins can update app_config" ON app_config;
CREATE POLICY "Admins can update app_config"
  ON app_config
  FOR UPDATE
  TO authenticated
  USING (is_current_user_admin())
  WITH CHECK (is_current_user_admin());

-- INSERT policy: admins can insert new config keys from the client (aiops_signup_alert, etc.)
DROP POLICY IF EXISTS "Admins can insert app_config" ON app_config;
CREATE POLICY "Admins can insert app_config"
  ON app_config
  FOR INSERT
  TO authenticated
  WITH CHECK (is_current_user_admin());

-- DELETE policy: admins can remove config keys (e.g. clearing aiops_signup_alert)
DROP POLICY IF EXISTS "Admins can delete app_config" ON app_config;
CREATE POLICY "Admins can delete app_config"
  ON app_config
  FOR DELETE
  TO authenticated
  USING (is_current_user_admin());

-- ── subscriptions: replace FOR ALL with INSERT + UPDATE only ──────────────────

DROP POLICY IF EXISTS "Service role can upsert subscriptions" ON subscriptions;

CREATE POLICY "Service role can insert subscriptions"
  ON subscriptions
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update subscriptions"
  ON subscriptions
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);
