/*
  # Remove PIN support from app lock and vault protection

  ## Summary
  Removes PIN as an authentication option throughout the app. The new model is:
  - App Lock: Off or Face ID (biometric)
  - Vault Protection: No or Face ID (biometric)
  - When Face ID fails, the fallback is email + password re-authentication

  ## Changes

  ### user_settings table
  1. Migrate any existing 'pin' or 'biometric_or_pin' login_method values to 'biometric'
     (preserves the intent of "require unlock" without PIN)
  2. Drop the old login_method CHECK constraint
  3. Add a new CHECK constraint allowing only: 'none', 'biometric', 'password'
     ('password' is kept as a legacy alias treated as 'none' in code)

  ### No structural changes to vault_face_id_required
  The vault_face_id_required boolean column continues to serve as Vault Protection.
  No migration needed there — it already maps cleanly to the new "No / Face ID" model.

  ## Notes
  - 'biometric_or_pin' users get upgraded to 'biometric' (the stronger option)
  - 'pin' only users get upgraded to 'biometric' — on devices without biometrics,
    the fallback email/password flow handles authentication
  - No data is lost; the column value is updated in-place
*/

-- 1. Migrate PIN users to biometric before tightening the constraint
UPDATE user_settings
SET login_method = 'biometric'
WHERE login_method IN ('pin', 'biometric_or_pin');

-- 2. Drop old constraint (name may vary; use DO block to handle gracefully)
DO $$
BEGIN
  ALTER TABLE user_settings DROP CONSTRAINT IF EXISTS user_settings_login_method_check;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Also drop any other CHECK constraints on the column that may have a generated name
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'user_settings'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%login_method%'
  LOOP
    EXECUTE format('ALTER TABLE user_settings DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;

-- 3. Add new CHECK constraint with only supported values
ALTER TABLE user_settings
  ADD CONSTRAINT user_settings_login_method_check
  CHECK (login_method IN ('none', 'biometric', 'password'));
