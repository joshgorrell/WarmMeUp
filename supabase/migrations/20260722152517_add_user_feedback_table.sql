/*
# Add user_feedback table and feedback app_config seeds

1. New Tables
- `user_feedback`
  - `id` (uuid, primary key, default gen_random_uuid())
  - `user_id` (uuid, references auth.users ON DELETE CASCADE, NOT NULL, defaults to auth.uid())
  - `user_email` (text, denormalized for admin display and email reply-to)
  - `content` (text, the feedback message body)
  - `created_at` (timestamptz, default now())

2. app_config seeds
- `feedback_enabled` (jsonb boolean, default false) — controls whether the feedback row appears in user Settings
- `feedback_emails` (jsonb array of email strings, default []) — admin-specified recipient addresses for feedback emails

3. Security (RLS)
- Enable RLS on `user_feedback`.
- INSERT: authenticated users can insert their own feedback (WITH CHECK auth.uid() = user_id).
- SELECT: admins can read all feedback rows (USING is_current_user_admin()). No user can read other users' feedback.
- No UPDATE or DELETE policies — feedback is immutable once submitted.

4. Important Notes
- The user_id column defaults to auth.uid() so client inserts omitting user_id still satisfy the INSERT WITH CHECK.
- user_email is denormalized from auth.users.email at insert time so admins see the email even after account deletion (the feedback row itself cascades on delete, but while it exists the email is visible).
- app_config already has RLS allowing authenticated SELECT and admin INSERT/UPDATE, so no changes needed there.
*/

CREATE TABLE IF NOT EXISTS user_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email text,
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE user_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "insert_own_feedback" ON user_feedback;
CREATE POLICY "insert_own_feedback" ON user_feedback
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "select_admin_feedback" ON user_feedback;
CREATE POLICY "select_admin_feedback" ON user_feedback
  FOR SELECT TO authenticated
  USING (is_current_user_admin());

-- Seed app_config defaults if they don't exist
INSERT INTO app_config (key, value)
SELECT 'feedback_enabled', 'false'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM app_config WHERE key = 'feedback_enabled');

INSERT INTO app_config (key, value)
SELECT 'feedback_emails', '[]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM app_config WHERE key = 'feedback_emails');
