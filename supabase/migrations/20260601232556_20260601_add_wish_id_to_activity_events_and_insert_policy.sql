/*
  # Wish Activity Events Support

  ## Summary
  Extends the activity_events table so wish-related actions can be logged
  by the client and displayed in the Recent Activity feed.

  ## Changes

  ### Modified Tables
  - `activity_events`
    - New column: `wish_id` (uuid, nullable, FK → wishes.id)
      Allows wish events to link back to the specific wish for future deep-linking.

  ### Security
  - New INSERT policy: authenticated users can insert activity_events rows
    where actor_user_id matches their own user id. This lets the client log
    wish_created, wish_updated, wish_image_added, and wish_completed events
    directly without requiring an Edge Function.
  - Existing SELECT policy already covers couple members reading their own events.
  - Existing UPDATE policy already covers marking events as read.

  ## Notes
  1. The INSERT policy enforces actor_user_id = auth.uid() so users cannot
     impersonate each other.
  2. wish_id is nullable so existing screenshot events are unaffected.
  3. No data is modified; this is a purely additive migration.
*/

-- Add wish_id column to activity_events
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'activity_events' AND column_name = 'wish_id'
  ) THEN
    ALTER TABLE activity_events
      ADD COLUMN wish_id uuid REFERENCES wishes(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Allow authenticated users to insert their own activity events
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'activity_events'
      AND policyname = 'Actor can insert own activity events'
  ) THEN
    CREATE POLICY "Actor can insert own activity events"
      ON activity_events
      FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = actor_user_id);
  END IF;
END $$;
