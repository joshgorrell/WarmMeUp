/*
  # Drop note_templates table

  The Notes feature has been removed in favour of the Chat tab.
  This migration drops the note_templates table and all associated
  RLS policies (policies are automatically dropped with the table).

  1. Tables removed
    - `note_templates` — custom quick-note starters for couples

  2. Notes
    - Existing rows are removed along with the table.
    - All RLS policies on the table are dropped automatically.
    - No other tables are affected.
*/

DROP TABLE IF EXISTS note_templates;
