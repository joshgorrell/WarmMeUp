/**
 * Supabase Storage TUS protocol helpers. Kept independent of Expo/React Native
 * so request construction and offset validation can be tested in CI.
 *
 * Supabase requires 6 MiB chunks (except the final chunk).
 */
export const TUS_CHUNK_BYTES = 6 * 1024 * 1024;
export const TUS_PROTOCOL_VERSION = '1.0.0';

export function tusChunkLength(offset: number, totalBytes: number): number {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(totalBytes) ||
      offset < 0 || totalBytes <= 0 || offset > totalBytes) {
    throw new Error('Invalid resumable upload offset.');
  }
  return Math.min(TUS_CHUNK_BYTES, totalBytes - offset);
}

export function parseTusOffset(raw: string | null, totalBytes: number): number {
  if (!raw || !/^(0|[1-9][0-9]*)$/.test(raw)) {
    throw new Error('Storage did not return a valid resumable offset.');
  }
  const offset = Number(raw);
  if (!Number.isSafeInteger(offset) || offset > totalBytes) {
    throw new Error('Storage returned an out-of-range resumable offset.');
  }
  return offset;
}

export function encodeTusMetadata(metadata: Record<string, string>): string {
  // TUS metadata is a comma-separated list of key + base64-encoded UTF-8.
  // Use TextEncoder for non-ASCII filenames and MIME metadata.
  return Object.entries(metadata).map(([key, value]) => {
    if (!/^[A-Za-z0-9_-]+$/.test(key)) throw new Error('Invalid TUS metadata key.');
    const bytes = new TextEncoder().encode(value);
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let result = '';
    for (let i = 0; i < bytes.length; i += 3) {
      const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
      result += alphabet[(n >>> 18) & 63] + alphabet[(n >>> 12) & 63] +
        (i + 1 < bytes.length ? alphabet[(n >>> 6) & 63] : '=') +
        (i + 2 < bytes.length ? alphabet[n & 63] : '=');
    }
    return key + ' ' + result;
  }).join(',');
}

export function resolveTusLocation(endpoint: string, location: string | null): string {
  if (!location) throw new Error('Storage did not return a resumable upload URL.');
  const base = new URL(endpoint);
  const resolved = new URL(location, base);
  if (resolved.origin !== base.origin ||
      !resolved.pathname.startsWith('/storage/v1/upload/resumable/')) {
    throw new Error('Storage returned an unsafe resumable upload URL.');
  }
  return resolved.toString();
}

export function isRetryableTusStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500 && status <= 599;
}
