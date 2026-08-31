/*
# Fix dice self-roll receiver_id assignment

## Summary
When a user rolled the dice "For Me" (rolled_for = 'self'), the receiver_id
was incorrectly set to the partner's user ID instead of the roller's own
user ID. This caused the partner to see a ghost "pending dice challenge"
alert on their home page, but the Dice page itself correctly filtered it
out (because it filters on rolled_for = 'partner'). The fix corrects
existing data so self-rolls point back to the roller.

## Changes
1. Updates all `interactions` rows where `type = 'dice'` AND
   `rolled_for = 'self'` AND `receiver_id != sender_id` — sets
   `receiver_id = sender_id` so the roll is correctly treated as private
   to the roller.
2. Also sets `is_active = false` on those rows so they no longer surface
   as "active" interactions on the partner's home page. Self-rolls are
   private ephemeral rolls and should not appear in anyone's active
   interaction feed.

## Security
No RLS or policy changes. This is a data correction only.
*/

UPDATE interactions
SET receiver_id = sender_id,
    is_active = false
WHERE type = 'dice'
  AND rolled_for = 'self'
  AND receiver_id != sender_id
  AND deleted_at IS NULL;
