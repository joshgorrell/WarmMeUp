/*
# Soft-delete chat activity cards when a Wish is deleted

## Problem
When a Wish is deleted, the synthetic chat_messages rows that were created
by the `create_chat_activity_for_wish` trigger and the `bump_wish` RPC
remain in the chat timeline. These rows have `content_text` starting with
`__WMU_ACTIVITY__:` and embed the wish's ID as `sourceId` in the JSON
payload. The chat screen renders them as tappable activity cards pointing
to a wish that no longer exists.

## Changes
1. Create a new trigger function `cleanup_chat_activity_on_wish_delete()`
   that runs BEFORE DELETE on `wishes`. It soft-deletes (sets `deleted_at`)
   any `chat_messages` rows for the same couple whose `content_text`
   contains the wish's ID and starts with the `__WMU_ACTIVITY__:` prefix.
2. Attach it as a BEFORE DELETE trigger on `wishes`.

## Why soft-delete (deleted_at) instead of hard DELETE
- The chat screen already filters `is('deleted_at', null)` so soft-deleted
  rows disappear from the UI.
- The chat realtime UPDATE handler checks `updated.deleted_at` and
  removes the message from local state, so the card vanishes live for
  any user viewing chat.
- Hard-deleting chat rows would bypass the realtime UPDATE path and
  could leave stale cards on screen until a full reload.

## Security
- The trigger function is SECURITY DEFINER so it can update chat_messages
  regardless of which user initiated the wish deletion.
- No new RLS policies needed — the trigger runs internally.
- No new tables or columns.
*/

CREATE OR REPLACE FUNCTION public.cleanup_chat_activity_on_wish_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE chat_messages
  SET deleted_at = now()
  WHERE couple_id = OLD.couple_id
    AND deleted_at IS NULL
    AND content_text LIKE '__WMU_ACTIVITY__:%'
    AND content_text LIKE '%' || OLD.id::text || '%';

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_cleanup_chat_activity_on_wish_delete ON wishes;
CREATE TRIGGER trg_cleanup_chat_activity_on_wish_delete
BEFORE DELETE ON wishes
FOR EACH ROW EXECUTE FUNCTION public.cleanup_chat_activity_on_wish_delete();
