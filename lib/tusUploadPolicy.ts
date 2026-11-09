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

/**
 * Encode UTF-8 without TextEncoder, which is not consistently available in
 * React Native Hermes. Handles surrogate pairs and malformed UTF-16 safely.
 */
export function tusUtf8Bytes(value: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < value.length; i++) {
    let cp = value.charCodeAt(i);
    if (cp >= 0xd800 && cp <= 0xdbff) {
      const next = value.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        cp = 0x10000 + ((cp - 0xd800) << 10) + next - 0xdc00;
        i++;
      } else cp = 0xfffd;
    } else if (cp >= 0xdc00 && cp <= 0xdfff) cp = 0xfffd;
    if (cp <= 0x7f) bytes.push(cp);
    else if (cp <= 0x7ff) bytes.push(0xc0 | (cp >> 6), 0x80 | (cp & 63));
    else if (cp <= 0xffff) bytes.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
    else bytes.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
  }
  return bytes;
}

export function encodeTusMetadata(metadata: Record<string, string>): string {
  // TUS metadata is a comma-separated list of key + base64-encoded UTF-8.
  // Use a Hermes-compatible UTF-8 encoder for filenames and MIME metadata.
  return Object.entries(metadata).map(([key, value]) => {
    if (!/^[A-Za-z0-9_-]+$/.test(key)) throw new Error('Invalid TUS metadata key.');
    const bytes = tusUtf8Bytes(value);
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
  const prefix = '/storage/v1/upload/resumable/';
  // An upload session is an opaque server-issued token, not an arbitrary
  // relative path. Reject user-info, query strings, fragments, encoded path
  // separators and nested paths before using a URL as an authenticated target.
  const token = resolved.pathname.startsWith(prefix)
    ? resolved.pathname.slice(prefix.length) : '';
  if (resolved.origin !== base.origin ||
      resolved.protocol !== 'https:' && base.protocol === 'https:' ||
      resolved.username || resolved.password ||
      resolved.search || resolved.hash ||
      !token || token.includes('/') ||
      /%(?:2f|5c|2e|25)/i.test(token) ||
      !/^[A-Za-z0-9._~-]+$/.test(token)) {
    throw new Error('Storage returned an unsafe resumable upload URL.');
  }
  return resolved.toString();
}

export function isRetryableTusStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500 && status <= 599;
}
