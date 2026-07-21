UPDATE storage.buckets
SET allowed_mime_types = array_cat(
  allowed_mime_types,
  ARRAY['image/heic', 'image/heif', 'image/heif-sequence']::text[]
)
WHERE name = 'avatars'
  AND NOT (allowed_mime_types @> ARRAY['image/heic']::text[]);
