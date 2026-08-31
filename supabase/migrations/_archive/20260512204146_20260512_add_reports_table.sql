/*
  # Add Reports Table

  ## Purpose
  Stores safety reports submitted by users from the Safety & Support section.

  ## New Tables
  - `reports`
    - `id` (uuid, primary key)
    - `reporter_id` (uuid, FK → auth.users) — the user who submitted the report
    - `body` (text) — the user's description of the concern
    - `status` (text, default 'pending') — workflow status: pending, reviewed, resolved
    - `created_at` (timestamptz)

  ## Security
  - RLS enabled
  - Users can INSERT their own reports (reporter_id must match auth.uid())
  - Users cannot read any reports (admin-only access via service role)
*/

CREATE TABLE IF NOT EXISTS reports (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body         text NOT NULL,
  status       text NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'reviewed', 'resolved')),
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can submit their own reports"
  ON reports FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = reporter_id);
