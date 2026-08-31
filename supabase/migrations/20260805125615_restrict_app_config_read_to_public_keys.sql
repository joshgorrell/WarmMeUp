/*
  # Restrict which app_config rows a normal user can read

  1. Problem
     - Policy "Authenticated users can read app_config" used USING (true), so every
       signed-in user could read the whole table, including
       `global_debug_access.support_code_hash` (an unsalted SHA-256 of a 6-digit code,
       brute-forceable offline) and the `feedback_emails` recipient list.

  2. Change
     - Replace it with a policy that lets non-admins read only the two feature flags the
       app actually reads (`feedback_enabled`, `debug_mode_enabled`) and lets admins read
       everything.

  3. Notes
     - Client readers of app_config outside the admin area only ever request
       `feedback_enabled` (app/(app)/account.tsx, app/(app)/settings.tsx) and
       `debug_mode_enabled` (app/debug.tsx), so behaviour is unchanged for them.
     - The pre-login support-access check keeps working because
       `get_global_debug_status()` is SECURITY DEFINER and does not depend on this policy.
     - Admin screens keep full read access through `is_current_user_admin()`.
*/

DROP POLICY IF EXISTS "Authenticated users can read app_config" ON public.app_config;

CREATE POLICY "Read public app_config keys or all keys as admin"
  ON public.app_config
  FOR SELECT
  TO authenticated
  USING (
    key IN ('feedback_enabled', 'debug_mode_enabled')
    OR is_current_user_admin()
  );
