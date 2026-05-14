/*
  # Dice Face Labels System

  ## Summary
  Enables admin-editable dice face labels that can be assigned to individual dice prompts.

  ## Changes

  ### New Tables
  - `dice_face_labels`
    - `id` (uuid, primary key)
    - `label` (text, unique) — the all-caps word shown on the die face (e.g. "DARE", "SECRET")
    - `color` (text) — hex color for the label accent
    - `sort_order` (integer) — display ordering in admin UI
    - `created_at` (timestamptz)

  ### Modified Tables
  - `dice_prompts`
    - Added `face_label` (text, nullable) — references the label name to display when this prompt is rolled; null means random/any face

  ## Security
  - RLS enabled on `dice_face_labels`
  - Authenticated users can read labels (needed to render the die)
  - Only admins (via service role / admin check) can insert/update/delete — enforced by checking profiles.is_admin

  ## Notes
  1. The 6 default labels are seeded from the existing hardcoded NeonDice values
  2. `face_label` on `dice_prompts` is nullable — existing prompts remain unassigned (random face behavior preserved)
  3. Label name is stored as plain text (not a FK) to keep schema simple and avoid cascade issues when labels are renamed
*/

-- Create dice_face_labels table
CREATE TABLE IF NOT EXISTS dice_face_labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  color text NOT NULL DEFAULT '#FFB347',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT dice_face_labels_label_unique UNIQUE (label)
);

ALTER TABLE dice_face_labels ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read labels (needed to render the dice face)
CREATE POLICY "Authenticated users can read dice face labels"
  ON dice_face_labels FOR SELECT
  TO authenticated
  USING (true);

-- Only admins can insert labels
CREATE POLICY "Admins can insert dice face labels"
  ON dice_face_labels FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.is_admin = true
    )
  );

-- Only admins can update labels
CREATE POLICY "Admins can update dice face labels"
  ON dice_face_labels FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.is_admin = true
    )
  );

-- Only admins can delete labels
CREATE POLICY "Admins can delete dice face labels"
  ON dice_face_labels FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.is_admin = true
    )
  );

-- Seed the 6 default labels from existing NeonDice hardcoded values
INSERT INTO dice_face_labels (label, color, sort_order) VALUES
  ('DARE',   '#FF2E8A', 1),
  ('ASK',    '#FF5A3D', 2),
  ('NOTE',   '#FFB347', 3),
  ('TOUCH',  '#FF3D4F', 4),
  ('SECRET', '#FF2E8A', 5),
  ('WILD',   '#FFB347', 6)
ON CONFLICT (label) DO NOTHING;

-- Add face_label column to dice_prompts
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'dice_prompts' AND column_name = 'face_label'
  ) THEN
    ALTER TABLE dice_prompts ADD COLUMN face_label text DEFAULT NULL;
  END IF;
END $$;
