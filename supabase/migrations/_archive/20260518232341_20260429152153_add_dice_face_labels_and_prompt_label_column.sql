
CREATE TABLE IF NOT EXISTS dice_face_labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  color text NOT NULL DEFAULT '#FFB347',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT dice_face_labels_label_unique UNIQUE (label)
);

ALTER TABLE dice_face_labels ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated users can read dice face labels' AND tablename = 'dice_face_labels') THEN
    CREATE POLICY "Authenticated users can read dice face labels"
      ON dice_face_labels FOR SELECT
      TO authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admins can insert dice face labels' AND tablename = 'dice_face_labels') THEN
    CREATE POLICY "Admins can insert dice face labels"
      ON dice_face_labels FOR INSERT
      TO authenticated
      WITH CHECK (
        EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true)
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admins can update dice face labels' AND tablename = 'dice_face_labels') THEN
    CREATE POLICY "Admins can update dice face labels"
      ON dice_face_labels FOR UPDATE
      TO authenticated
      USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true))
      WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admins can delete dice face labels' AND tablename = 'dice_face_labels') THEN
    CREATE POLICY "Admins can delete dice face labels"
      ON dice_face_labels FOR DELETE
      TO authenticated
      USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true));
  END IF;
END $$;

INSERT INTO dice_face_labels (label, color, sort_order) VALUES
  ('DARE',   '#FF2E8A', 1),
  ('ASK',    '#FF5A3D', 2),
  ('NOTE',   '#FFB347', 3),
  ('TOUCH',  '#FF3D4F', 4),
  ('SECRET', '#FF2E8A', 5),
  ('WILD',   '#FFB347', 6)
ON CONFLICT (label) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'dice_prompts' AND column_name = 'face_label'
  ) THEN
    ALTER TABLE dice_prompts ADD COLUMN face_label text DEFAULT NULL;
  END IF;
END $$;
