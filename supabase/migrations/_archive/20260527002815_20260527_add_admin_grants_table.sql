/*
  # Add Admin Grants Table

  ## Summary
  Creates a manual entitlement system so admins can grant premium access to specific
  users without requiring a paid subscription. Used for admin accounts, comped users,
  and extended trials.

  ## New Tables
  - `admin_grants`
    - `id` — uuid PK
    - `user_id` — the user receiving the grant (FK → auth.users)
    - `granted_by` — the admin who created the grant (FK → auth.users)
    - `entitlement_type` — one of: free_access, extended_trial, comped_subscription
    - `starts_at` — when the grant begins (default now)
    - `expires_at` — when the grant ends (null = never expires)
    - `active` — whether this grant is currently in effect
    - `notes` — optional admin note/reason
    - `created_at` — record creation timestamp

  ## Security
  - RLS enabled
  - Users can only SELECT their own active grants
  - Only admins (is_admin = true on their profile) can INSERT/UPDATE/DELETE grants
  - Revoke is done by setting active = false, not deleting rows (audit trail)

  ## Indexes
  - Unique partial index: only one active grant per user at a time
  - Index on granted_by for admin audit queries
*/

CREATE TABLE IF NOT EXISTS admin_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_by uuid NOT NULL REFERENCES auth.users(id),
  entitlement_type text NOT NULL DEFAULT 'free_access'
    CHECK (entitlement_type = ANY (ARRAY['free_access', 'extended_trial', 'comped_subscription'])),
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NULL,
  active boolean NOT NULL DEFAULT true,
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Only one active grant per user at a time
CREATE UNIQUE INDEX IF NOT EXISTS admin_grants_one_active_per_user
  ON admin_grants (user_id)
  WHERE active = true;

-- Index for admin audit list queries
CREATE INDEX IF NOT EXISTS admin_grants_granted_by_idx ON admin_grants (granted_by);
CREATE INDEX IF NOT EXISTS admin_grants_user_id_idx ON admin_grants (user_id);

ALTER TABLE admin_grants ENABLE ROW LEVEL SECURITY;

-- Users can read their own grants (so the edge function can see it via user JWT)
CREATE POLICY "Users can read own admin grants"
  ON admin_grants FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Only admins can insert grants
CREATE POLICY "Admins can insert admin grants"
  ON admin_grants FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND (profiles.is_admin = true OR profiles.is_super_admin = true)
    )
  );

-- Only admins can update grants (e.g. set active=false to revoke)
CREATE POLICY "Admins can update admin grants"
  ON admin_grants FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND (profiles.is_admin = true OR profiles.is_super_admin = true)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND (profiles.is_admin = true OR profiles.is_super_admin = true)
    )
  );

-- Only super admins can hard-delete grants (soft revoke via active=false is preferred)
CREATE POLICY "Super admins can delete admin grants"
  ON admin_grants FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  );
