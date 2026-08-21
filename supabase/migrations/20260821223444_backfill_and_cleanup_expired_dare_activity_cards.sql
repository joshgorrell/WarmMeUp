-- 1. Backfill expiresAt into existing dare activity card payloads that are missing it
UPDATE chat_messages cm
SET content_text = replace(
  cm.content_text,
  '"sourceId": "' || i.id::text || '"',
  '"sourceId": "' || i.id::text || '", "expiresAt": "' || to_char(i.expires_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+00:00"') || '"'
)
FROM interactions i
WHERE cm.content_text LIKE '__WMU_ACTIVITY__:%'
  AND cm.content_text LIKE '%' || i.id::text || '%'
  AND i.type = 'dare'
  AND i.expires_at IS NOT NULL
  AND cm.deleted_at IS NULL
  AND cm.content_text NOT LIKE '%"expiresAt"%';

-- 2. Soft-delete chat activity cards for dares that have already expired
--    so they disappear from the chat feed instead of showing as stale "View Dare"
UPDATE chat_messages cm
SET deleted_at = now()
FROM interactions i
WHERE cm.content_text LIKE '__WMU_ACTIVITY__:%'
  AND cm.content_text LIKE '%"kind": "dare"%' || i.id::text || '%'
  AND i.type = 'dare'
  AND i.status = 'expired'
  AND i.expires_at < now()
  AND cm.deleted_at IS NULL;

-- Also handle the case where the dare ID appears in a slightly different JSON format
UPDATE chat_messages cm
SET deleted_at = now()
FROM interactions i
WHERE cm.content_text LIKE '__WMU_ACTIVITY__:%'
  AND cm.content_text LIKE '%' || i.id::text || '%'
  AND i.type = 'dare'
  AND i.status = 'expired'
  AND i.expires_at < now()
  AND cm.deleted_at IS NULL;