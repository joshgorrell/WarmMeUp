/**
 * Given a media storage path, return the thumbnail path for a video.
 * Photos don't have separate thumbnails — return null for non-video media.
 */
export function videoThumbnailPath(mediaStoragePath: string | null, mediaType?: 'photo' | 'video' | null): string | null {
  if (!mediaStoragePath) return null;
  if (mediaType && mediaType !== 'video') return null;
  // Thumbnails are stored alongside the video with a _thumb suffix
  const dotIndex = mediaStoragePath.lastIndexOf('.');
  if (dotIndex === -1) return `${mediaStoragePath}_thumb`;
  return `${mediaStoragePath.slice(0, dotIndex)}_thumb${mediaStoragePath.slice(dotIndex)}`;
}
