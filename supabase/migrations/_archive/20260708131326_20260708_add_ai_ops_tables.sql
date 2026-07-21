/*
# AI Operations Tables

Adds three tables to support the AI Ops system (Daily Product Brief, Signup Monitor, Bug Analyzer).

## New Tables

### ai_loop_runs
Audit log for every AI loop execution. Records what ran, when, whether it succeeded,
and the structured output (findings). One row per run — never deleted.

Columns:
- id: uuid primary key
- loop_type: one of 'daily_brief' | 'signup_monitor' | 'bug_analyzer'
- started_at / completed_at: execution window
- status: 'running' | 'success' | 'failed'
- stop_condition_met: true when the loop decided it was done (regardless of success)
- success_condition_met: true only when the output was verified correct
- findings: structured JSONB output from the AI
- error_message: error detail when status = 'failed'

### ai_issues
Internal issue backlog created by the bug_analyzer loop. Admin can resolve or dismiss.

Columns:
- id: uuid primary key
- title / body: issue description
- severity: 'low' | 'medium' | 'high'
- source_loop_type / source_run_id: traceability back to the run that created this
- status: 'open' | 'resolved' | 'dismissed'
- resolved_at: timestamp when resolved

### ai_loop_settings
One row per loop type. Controls whether each loop is enabled and whether human approval
is required before it takes action.

## Security
- RLS enabled on all three tables.
- Only admin users (is_admin = true OR is_super_admin = true on profiles) can read all three tables.
- Only super_admin users can update ai_loop_settings.
- Edge functions use the service role key and bypass RLS — that is intentional.
- No anon access to any of these tables.

## Seed Data
Inserts default settings rows for all three loops (enabled, no human approval required).
Uses ON CONFLICT DO NOTHING so re-running the migration is safe.
*/

-- ai_loop_runs
CREATE TABLE IF NOT EXISTS ai_loop_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loop_type text NOT NULL CHECK (loop_type IN ('daily_brief', 'signup_monitor', 'bug_analyzer')),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'success', 'failed')),
  stop_condition_met boolean NOT NULL DEFAULT false,
  success_condition_met boolean NOT NULL DEFAULT false,
  findings jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_loop_runs_loop_type_started_at_idx
  ON ai_loop_runs (loop_type, started_at DESC);

ALTER TABLE ai_loop_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_select_ai_loop_runs" ON ai_loop_runs;
CREATE POLICY "admin_select_ai_loop_runs" ON ai_loop_runs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND (profiles.is_admin = true OR profiles.is_super_admin = true)
    )
  );

DROP POLICY IF EXISTS "admin_insert_ai_loop_runs" ON ai_loop_runs;
CREATE POLICY "admin_insert_ai_loop_runs" ON ai_loop_runs FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND (profiles.is_admin = true OR profiles.is_super_admin = true)
    )
  );

DROP POLICY IF EXISTS "admin_update_ai_loop_runs" ON ai_loop_runs;
CREATE POLICY "admin_update_ai_loop_runs" ON ai_loop_runs FOR UPDATE
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

-- ai_issues
CREATE TABLE IF NOT EXISTS ai_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text,
  severity text NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high')),
  source_loop_type text,
  source_run_id uuid REFERENCES ai_loop_runs(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_issues_status_created_at_idx
  ON ai_issues (status, created_at DESC);

ALTER TABLE ai_issues ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_select_ai_issues" ON ai_issues;
CREATE POLICY "admin_select_ai_issues" ON ai_issues FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND (profiles.is_admin = true OR profiles.is_super_admin = true)
    )
  );

DROP POLICY IF EXISTS "admin_insert_ai_issues" ON ai_issues;
CREATE POLICY "admin_insert_ai_issues" ON ai_issues FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND (profiles.is_admin = true OR profiles.is_super_admin = true)
    )
  );

DROP POLICY IF EXISTS "admin_update_ai_issues" ON ai_issues;
CREATE POLICY "admin_update_ai_issues" ON ai_issues FOR UPDATE
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

DROP POLICY IF EXISTS "admin_delete_ai_issues" ON ai_issues;
CREATE POLICY "admin_delete_ai_issues" ON ai_issues FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND (profiles.is_admin = true OR profiles.is_super_admin = true)
    )
  );

-- ai_loop_settings
CREATE TABLE IF NOT EXISTS ai_loop_settings (
  loop_type text PRIMARY KEY CHECK (loop_type IN ('daily_brief', 'signup_monitor', 'bug_analyzer')),
  enabled boolean NOT NULL DEFAULT true,
  require_human_approval boolean NOT NULL DEFAULT false,
  last_triggered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ai_loop_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_select_ai_loop_settings" ON ai_loop_settings;
CREATE POLICY "admin_select_ai_loop_settings" ON ai_loop_settings FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND (profiles.is_admin = true OR profiles.is_super_admin = true)
    )
  );

DROP POLICY IF EXISTS "superadmin_update_ai_loop_settings" ON ai_loop_settings;
CREATE POLICY "superadmin_update_ai_loop_settings" ON ai_loop_settings FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.is_super_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.is_super_admin = true
    )
  );

-- Seed default settings
INSERT INTO ai_loop_settings (loop_type, enabled, require_human_approval)
VALUES
  ('daily_brief',    true, false),
  ('signup_monitor', true, false),
  ('bug_analyzer',   true, false)
ON CONFLICT (loop_type) DO NOTHING;
