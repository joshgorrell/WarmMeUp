/*
# Add permanent review access records

1. New Tables
- `public.permanent_review_access`
- `user_id` (uuid, primary key): Auth user explicitly granted permanent review access.
- `granted_at` (timestamptz): When the access record was created.
- `granted_by` (uuid, nullable): Optional Auth user who granted the access.
- `note` (text): Internal reason for the grant.

2. Modified Tables
- No existing tables are modified.

3. Security
- Row Level Security is enabled on the new table.
- Direct table access is revoked from `anon` and `authenticated`.
- No client-facing policies are created; the table is deny-by-default and is read by the server-authoritative subscription function with the service role.
- The user ID references `auth.users` and is protected from accidental deletion through a restrictive foreign key.

4. Important Notes
- Permanent review access is an explicit database record keyed by Auth user ID, never an email pattern, device, IP address, Apple account, or TestFlight state.
- The subscription service treats an active record as an additional premium-access source. It does not modify RevenueCat subscriptions or normal user subscription behavior.
- To add or remove a reviewer later, insert or delete that user's row in this table using an authorized database maintenance operation.
*/

CREATE TABLE IF NOT EXISTS public.permanent_review_access (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE RESTRICT,
  granted_at timestamptz NOT NULL DEFAULT now(),
  granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  note text NOT NULL DEFAULT 'Permanent review access'
);

ALTER TABLE public.permanent_review_access ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.permanent_review_access FROM anon, authenticated;
