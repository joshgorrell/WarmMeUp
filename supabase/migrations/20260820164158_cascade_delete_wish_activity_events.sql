/*
# Cascade delete activity events when a wish is deleted

## Problem
When a user deletes a Wish, related activity_events rows (wish_created,
wish_updated, wish_image_added, wish_completed, wish_bumped) survived because
the foreign key was ON DELETE SET NULL. This left orphaned notification cards
on the Activity screen pointing to a wish that no longer existed.

## Changes
1. Drop the existing `activity_events_wish_id_fkey` foreign key constraint.
2. Recreate it with `ON DELETE CASCADE` so that deleting a wish automatically
   removes all related activity_events rows.

## Security
- No RLS policy changes.
- No new tables or columns.
- Only the referential integrity rule on `activity_events.wish_id` changes
  from SET NULL to CASCADE.

## Notes
- `wish_reactions.wish_id` already has ON DELETE CASCADE — no change needed.
- The `interactions` table has no `wish_id` column — `tell_me` interactions
  are a separate legacy concept and are not affected by wish deletion.
*/

ALTER TABLE public.activity_events
  DROP CONSTRAINT IF EXISTS activity_events_wish_id_fkey;

ALTER TABLE public.activity_events
  ADD CONSTRAINT activity_events_wish_id_fkey
  FOREIGN KEY (wish_id) REFERENCES public.wishes(id) ON DELETE CASCADE;
