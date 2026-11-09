import { File } from 'expo-file-system';
import type { TusResponse, TusTransport } from './tusUploadSession';

/**
 * Expo SDK 54 native TUS adapter. Reads at most one 6 MiB slice into JS
 * memory, never the entire recording. The server determines the offset.
 *
 * The adapter is deliberately separate from the existing native PUT uploader
 * until it has been validated on physical iOS and Android devices.
 */
export function createNativeTusTransport(uri: string, timeoutMs = 120_000): TusTransport {
  const file = new File(uri);
  return {
    async readChunk(offset, length) {
      if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) ||
          offset < 0 || length <= 0 || length > 6 * 1024 * 1024) {
        throw new Error('Invalid native video chunk request.');
      }
      const slice = file.slice(offset, offset + length);
      const bytes = new Uint8Array(await slice.arrayBuffer());
      if (bytes.byteLength !== length) throw new Error('Video chunk could not be read.');
      return bytes;
    },
    async request(method, url, headers, body): Promise<TusResponse> {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(url, {
          method, headers,
          ...(body ? { body: body as unknown as BodyInit } : {}),
          signal: controller.signal,
        });
        return {
          status: response.status,
          headers: {
            location: response.headers.get('location'),
            'upload-offset': response.headers.get('upload-offset'),
          },
        };
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}
