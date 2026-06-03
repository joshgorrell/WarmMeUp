/*
  # Security Simplification: Unified App Unlock Model

  ## Summary
  Separates Account Login (email/Apple/Google) from App Unlock (PIN/biometric privacy gate).
  Introduces 'none' and 'biometric_or_pin' as valid login_method values, removes 'password'
  as an unlock method (password is account login only, not an unlock method).

  ## Changes

  ### 1. user_settings.login_method constraint
  - Adds 'none' (no app unlock) and 'biometric_or_pin' (Face ID with PIN fallback)
  - Keeps 'password' in constraint temporarily for any in-flight client compatibility
  - Existing: 'password' | 'pin' | 'biometric'
  - New:      'none' | 'pin' | 'biometric' | 'biometric_or_pin' | 'password'

  ### 2. Data migration
  - Migrates all existing login_method = 'password' rows to 'none'
    (these users had "no app lock" — same behavior, clearer naming)

  ### 3. Column default updates (affect new users only)
  - login_method: 'pin' → 'none'   (new users start with no app lock)
  - vault_face_id_required: true → false  (new users use App Security Settings by default)
  - lock_after_seconds: already NULL (no re-lock timer) — unchanged

  ### 4. Security
  - No RLS changes required (user_settings RLS policies unchanged)

  ## Notes
  - Existing users who had login_method='pin' or 'biometric' retain their setting unchanged
  - Existing users who had vault_face_id_required=true retain that setting unchanged
  - Only the new-user defaults and the 'password'→'none' rename change behavior
*/

-- 1. Drop old check constraint and recreate with new allowed values
ALTER TABLE public.user_settings
  DROP CONSTRAINT IF EXISTS user_settings_login_method_check;

ALTER TABLE public.user_settings
  ADD CONSTRAINT user_settings_login_method_check
  CHECK (login_method IN ('password', 'pin', 'biometric', 'none', 'biometric_or_pin'));

-- 2. Migrate existing 'password' records to 'none'
UPDATE public.user_settings
SET login_method = 'none'
WHERE login_method = 'password';

-- 3. Update column defaults for new users
ALTER TABLE public.user_settings
  ALTER COLUMN login_method SET DEFAULT 'none';

ALTER TABLE public.user_settings
  ALTER COLUMN vault_face_id_required SET DEFAULT false;
