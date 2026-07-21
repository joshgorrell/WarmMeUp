
-- Global Debug Access config row
INSERT INTO app_config (key, value, updated_at)
VALUES (
  'global_debug_access',
  '{"enabled": false, "support_code_hash": null, "expires_at": null}'::jsonb,
  now()
)
ON CONFLICT (key) DO NOTHING;

-- Audit log table for Global Debug Access actions
CREATE TABLE IF NOT EXISTS debug_access_log (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id            uuid REFERENCES auth.users ON DELETE SET NULL,
  action                   text NOT NULL CHECK (action IN ('enabled', 'disabled', 'code_regenerated', 'accessed', 'code_rejected')),
  device_info              jsonb,
  support_code_regenerated boolean DEFAULT false,
  created_at               timestamptz DEFAULT now()
);

ALTER TABLE debug_access_log ENABLE ROW LEVEL SECURITY;

-- Only admins can read the audit log
CREATE POLICY "admins_read_debug_access_log"
  ON debug_access_log FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND (profiles.is_admin = true OR profiles.is_super_admin = true)
    )
  );

-- RPC: get_global_debug_status — accessible to anon (no secret code hash exposed)
CREATE OR REPLACE FUNCTION get_global_debug_status()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'enabled', COALESCE((value->>'enabled')::boolean, false),
    'expires_at', value->>'expires_at'
  )
  FROM app_config
  WHERE key = 'global_debug_access'
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION get_global_debug_status() TO anon, authenticated;

-- RPC: validate_debug_support_code — accessible to anon; hashes the provided code
-- and compares against the stored SHA-256 hex hash. Logs result in debug_access_log.
CREATE OR REPLACE FUNCTION validate_debug_support_code(p_code text, p_device_info jsonb DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row        jsonb;
  v_enabled    boolean;
  v_expires_at timestamptz;
  v_code_hash  text;
  v_input_hash text;
  v_valid      boolean := false;
  v_reason     text := 'invalid';
BEGIN
  SELECT value INTO v_row
  FROM app_config
  WHERE key = 'global_debug_access';

  IF v_row IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'not_configured');
  END IF;

  v_enabled    := COALESCE((v_row->>'enabled')::boolean, false);
  v_expires_at := NULLIF(v_row->>'expires_at', '')::timestamptz;
  v_code_hash  := v_row->>'support_code_hash';

  IF NOT v_enabled THEN
    INSERT INTO debug_access_log (action, device_info, support_code_regenerated)
    VALUES ('code_rejected', p_device_info, false);
    RETURN jsonb_build_object('valid', false, 'reason', 'disabled');
  END IF;

  IF v_expires_at IS NOT NULL AND v_expires_at < now() THEN
    -- Auto-disable when expired
    UPDATE app_config
    SET value = value || '{"enabled": false}'::jsonb,
        updated_at = now()
    WHERE key = 'global_debug_access';

    INSERT INTO debug_access_log (action, device_info, support_code_regenerated)
    VALUES ('code_rejected', p_device_info, false);
    RETURN jsonb_build_object('valid', false, 'reason', 'expired');
  END IF;

  IF v_code_hash IS NULL THEN
    -- No code required (admin disabled code protection)
    v_valid  := true;
    v_reason := 'ok';
  ELSE
    -- Hash the submitted code with SHA-256 and compare hex strings
    v_input_hash := encode(digest(p_code, 'sha256'), 'hex');
    IF v_input_hash = v_code_hash THEN
      v_valid  := true;
      v_reason := 'ok';
    ELSE
      v_reason := 'wrong_code';
    END IF;
  END IF;

  INSERT INTO debug_access_log (action, device_info, support_code_regenerated)
  VALUES (
    CASE WHEN v_valid THEN 'accessed' ELSE 'code_rejected' END,
    p_device_info,
    false
  );

  RETURN jsonb_build_object('valid', v_valid, 'reason', v_reason);
END;
$$;

-- digest() requires pgcrypto
CREATE EXTENSION IF NOT EXISTS pgcrypto;

GRANT EXECUTE ON FUNCTION validate_debug_support_code(text, jsonb) TO anon, authenticated;

-- RPC: admin_set_global_debug_access — admin only; sets enabled state, code hash, and expiry
CREATE OR REPLACE FUNCTION admin_set_global_debug_access(
  p_enabled          boolean,
  p_support_code_hash text DEFAULT NULL,
  p_expires_at       timestamptz DEFAULT NULL,
  p_action           text DEFAULT 'enabled'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id uuid := auth.uid();
BEGIN
  -- Only admins may call this
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = v_admin_id
    AND (is_admin = true OR is_super_admin = true)
  ) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  UPDATE app_config
  SET value = jsonb_build_object(
    'enabled',            p_enabled,
    'support_code_hash',  p_support_code_hash,
    'expires_at',         CASE WHEN p_expires_at IS NULL THEN NULL ELSE p_expires_at::text END
  ),
  updated_at = now(),
  updated_by = v_admin_id
  WHERE key = 'global_debug_access';

  INSERT INTO debug_access_log (admin_user_id, action, support_code_regenerated)
  VALUES (
    v_admin_id,
    p_action,
    p_support_code_hash IS NOT NULL
  );
END;
$$;

GRANT EXECUTE ON FUNCTION admin_set_global_debug_access(boolean, text, timestamptz, text) TO authenticated;

-- Notify PostgREST of the new functions
NOTIFY pgrst, 'reload schema';
