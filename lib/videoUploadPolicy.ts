/**
 * Allow large, high-quality two-minute videos enough time on slower networks.
 * The upload deadline is per attempt, not a total upload budget.
 * Assume a conservative 0.75 Mbps usable upstream and allow overhead.
 * This is a timeout policy, not a file-size or duration limit.
 */
export const MIN_VIDEO_UPLOAD_TIMEOUT_MS = 300_000;
export const MAX_VIDEO_UPLOAD_TIMEOUT_MS = 1_200_000;
export function videoUploadTimeoutMs(sizeBytes: number | null | undefined): number {
  if (typeof sizeBytes !== 'number' || !Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return MIN_VIDEO_UPLOAD_TIMEOUT_MS;
  }
  const estimatedMs = (sizeBytes * 8 * 1000) / 750_000;
  return Math.min(MAX_VIDEO_UPLOAD_TIMEOUT_MS, Math.max(MIN_VIDEO_UPLOAD_TIMEOUT_MS, Math.ceil(estimatedMs * 1.5)));
}
