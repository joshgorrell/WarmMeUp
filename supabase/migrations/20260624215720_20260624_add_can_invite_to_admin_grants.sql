ALTER TABLE admin_grants
  ADD COLUMN IF NOT EXISTS can_invite boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN admin_grants.can_invite IS
  'Whether this grant allows the user to generate an invite code and pair with a partner.';
