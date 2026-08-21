-- Add image/gif to the vault bucket's allowed MIME types so GIFs can be copied from chat_media
UPDATE storage.buckets
SET allowed_mime_types = array_append(allowed_mime_types, 'image/gif')
WHERE id = 'vault' AND NOT ('image/gif' = ANY(allowed_mime_types));