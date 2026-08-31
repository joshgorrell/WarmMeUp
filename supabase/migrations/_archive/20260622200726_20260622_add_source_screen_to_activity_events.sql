-- Add source_screen column to activity_events so screenshot events carry context
-- about which tab they originated from (vault, chat, wish).
-- Nullable so all existing rows remain unaffected.
ALTER TABLE activity_events
  ADD COLUMN IF NOT EXISTS source_screen text;
