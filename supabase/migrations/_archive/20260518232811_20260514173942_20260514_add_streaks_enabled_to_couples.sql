
ALTER TABLE couples ADD COLUMN IF NOT EXISTS streaks_enabled boolean NOT NULL DEFAULT true;
