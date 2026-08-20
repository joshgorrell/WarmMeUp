/*
# Clean up orphaned wish activity cards and add safety-net function

## Problem
When a Wish is deleted, synthetic chat_messages rows with the
`__WMU_ACTIVITY__:` prefix and the wish's ID embedded as `sourceId`
should be soft-deleted by the `cleanup_chat_activity_on_wish_delete`
trigger. However, some orphaned rows remain — either because the wish
was deleted via a path that bypassed the trigger (e.g. the
disconnect-couple edge function which hard-deletes wishes), or because
the trigger's LIKE match on the wish ID inside the JSON payload failed.

## Changes
1. Soft-delete all currently orphaned chat activity rows: any row with
   `content_text` starting with `__WMU_ACTIVITY__:`, `deleted_at IS NULL`,
   whose embedded `sourceId` points to a wish that no longer exists in
   the `wishes` table. This is done as a one-time data cleanup.
2. Create a `cleanup_orphaned_wish_activity()` SECURITY DEFINER function
   that can be called manually or by a scheduled job to soft-delete any
   chat activity rows whose source wish no longer exists. This acts as
   a safety net for any future wish deletions that bypass the trigger.

## Security
- The one-time cleanup runs as a privileged migration (no RLS).
- The `cleanup_orphaned_wish_activity()` function is SECURITY DEFINER
  so it can update chat_messages regardless of the caller's role. It is
  NOT granted to anon or authenticated — only service-role or admin
  callers should invoke it.
- No new tables, columns, or RLS policies.
*/

-- 1. One-time cleanup: soft-delete orphaned wish activity cards.
--    We extract the sourceId from the JSON payload and check if the
--    wish still exists. If not, soft-delete the chat row.
UPDATE chat_messages cm
SET deleted_at = now()
WHERE cm.deleted_at IS NULL
  AND cm.content_text LIKE '__WMU_ACTIVITY__:%'
  AND cm.content_text LIKE '%"kind": "wish"%'
  AND NOT EXISTS (
    SELECT 1 FROM wishes w
    WHERE w.id::text = (
      -- Extract the sourceId UUID from the JSON payload.
      -- The payload is: __WMU_ACTIVITY__:{"kind":"wish","sourceId":"<uuid>",...}
      substring(cm.content_text from '"sourceId"[[:space:]]*:[[:space:]]*"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})')
    )
  );

-- Also clean up wish_bump activity cards whose source wish is gone.
UPDATE chat_messages cm
SET deleted_at = now()
WHERE cm.deleted_at IS NULL
  AND cm.content_text LIKE '__WMU_ACTIVITY__:%'
  AND cm.content_text LIKE '%"kind": "wish_bump"%'
  AND NOT EXISTS (
    SELECT 1 FROM wishes w
    WHERE w.id::text = (
      substring(cm.content_text from '"sourceId"[[:space:]]*:[[:space:]]*"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})')
    )
  );

-- 2. Safety-net function for future cleanup.
CREATE OR REPLACE FUNCTION public.cleanup_orphaned_wish_activity()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE chat_messages cm
  SET deleted_at = now()
  WHERE cm.deleted_at IS NULL
    AND cm.content_text LIKE '__WMU_ACTIVITY__:%'
    AND (
      cm.content_text LIKE '%"kind": "wish"%' OR
      cm.content_text LIKE '%"kind": "wish_bump"%'
    )
    AND NOT EXISTS (
      SELECT 1 FROM wishes w
      WHERE w.id::text = (
        substring(cm.content_text from '"sourceId"[[:space:]]*:[[:space:]]*"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})')
      )
    );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
