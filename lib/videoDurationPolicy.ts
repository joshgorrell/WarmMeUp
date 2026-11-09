/** ImagePickerAsset.duration is reported in milliseconds by Expo ImagePicker. */
export const MAX_SHARED_VIDEO_DURATION_MS = 60_000;

export type LibraryMediaDuration = {
  type?: string | null;
  mimeType?: string | null;
  duration?: number | null;
};

/** Unknown durations are not assumed to exceed the limit. */
export function isLibraryVideoTooLong(asset: LibraryMediaDuration): boolean {
  const isVideo = asset.type === 'video' || asset.mimeType?.toLowerCase().startsWith('video/') === true;
  return isVideo && typeof asset.duration === 'number' &&
    Number.isFinite(asset.duration) && asset.duration > MAX_SHARED_VIDEO_DURATION_MS;
}
