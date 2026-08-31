-- Change default challenge_expiry_hours from 24 to 1 (1 hour)
-- so the fallback matches the new per-dare timer default.

ALTER TABLE user_settings
  ALTER COLUMN challenge_expiry_hours SET DEFAULT 1;

-- Update existing users still on the old 24h default
UPDATE user_settings
  SET challenge_expiry_hours = 1
  WHERE challenge_expiry_hours = 24;
