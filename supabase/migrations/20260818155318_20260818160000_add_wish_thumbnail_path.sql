-- Add thumbnail_path column to wishes for pre-generated thumbnails
ALTER TABLE public.wishes ADD COLUMN IF NOT EXISTS thumbnail_path text;

-- Backfill: derive thumbnail path from existing image_storage_path
-- Pattern: replace extension with _thumb.jpg (matching videoThumbnailPath convention)
UPDATE public.wishes
SET thumbnail_path = REPLACE(image_storage_path, '.jpg', '_thumb.jpg')
WHERE image_storage_path IS NOT NULL
  AND image_storage_path LIKE '%.jpg'
  AND thumbnail_path IS NULL;

UPDATE public.wishes
SET thumbnail_path = REPLACE(image_storage_path, '.png', '_thumb.jpg')
WHERE image_storage_path IS NOT NULL
  AND image_storage_path LIKE '%.png'
  AND thumbnail_path IS NULL;

UPDATE public.wishes
SET thumbnail_path = REPLACE(image_storage_path, '.heic', '_thumb.jpg')
WHERE image_storage_path IS NOT NULL
  AND image_storage_path LIKE '%.heic'
  AND thumbnail_path IS NULL;

UPDATE public.wishes
SET thumbnail_path = REPLACE(image_storage_path, '.webp', '_thumb.jpg')
WHERE image_storage_path IS NOT NULL
  AND image_storage_path LIKE '%.webp'
  AND thumbnail_path IS NULL;
