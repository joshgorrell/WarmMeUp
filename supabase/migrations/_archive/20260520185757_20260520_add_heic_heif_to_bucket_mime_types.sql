/*
  # Add HEIC/HEIF to storage bucket allowed MIME types

  ## Summary
  iOS devices frequently produce HEIC/HEIF images from the camera and photo
  library. Although expo-image-picker transcodes these to JPEG when quality < 1,
  some devices or configurations skip transcoding and send the raw HEIC file.
  The Supabase storage buckets currently reject these uploads with a MIME type
  error before the file even reaches the RLS policy check.

  ## Changes
  - vault bucket: adds image/heic, image/heif, image/heif-sequence to allowed_mime_types
  - chat_media bucket: adds image/heic, image/heif, image/heif-sequence to allowed_mime_types

  ## Notes
  - Existing MIME types are preserved; this is purely additive
  - No RLS policy changes required — bucket membership rules are unchanged
*/

UPDATE storage.buckets
SET allowed_mime_types = array_cat(
  allowed_mime_types,
  ARRAY['image/heic', 'image/heif', 'image/heif-sequence']::text[]
)
WHERE name = 'vault'
  AND NOT (allowed_mime_types @> ARRAY['image/heic']::text[]);

UPDATE storage.buckets
SET allowed_mime_types = array_cat(
  allowed_mime_types,
  ARRAY['image/heic', 'image/heif', 'image/heif-sequence']::text[]
)
WHERE name = 'chat_media'
  AND NOT (allowed_mime_types @> ARRAY['image/heic']::text[]);
