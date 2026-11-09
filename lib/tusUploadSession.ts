import {
  TUS_CHUNK_BYTES, TUS_PROTOCOL_VERSION, encodeTusMetadata,
  isRetryableTusStatus, parseTusOffset, resolveTusLocation, tusChunkLength,
} from './tusUploadPolicy';

export type TusResponse = {
  status: number;
  headers: Record<string, string | null>;
};
export type TusTransport = {
  request: (method: 'POST' | 'HEAD' | 'PATCH', url: string,
    headers: Record<string, string>, body?: Uint8Array) => Promise<TusResponse>;
  readChunk: (offset: number, length: number) => Promise<Uint8Array>;
};
export type TusUploadParams = {
  endpoint: string;
  bucket: string;
  objectPath: string;
  mimeType: string;
  fileSize: number;
  authorization: string;
  apiKey: string;
  transport: TusTransport;
  onProgress?: (fraction: number) => void;
};

/**
 * TUS upload session, including retry/reconciliation of ambiguous PATCH
 * responses. No chunk is resent until HEAD confirms the server offset.
 * A caller may reuse the returned URL to resume in the same session.
 */
export async function uploadTusChunks(
  params: TusUploadParams,
  existingUrl?: string,
): Promise<string> {
  const { endpoint, transport, fileSize } = params;
  if (!Number.isSafeInteger(fileSize) || fileSize <= 0) throw new Error('Invalid video file size.');
  const common = {
    Authorization: params.authorization,
    apikey: params.apiKey,
    'Tus-Resumable': TUS_PROTOCOL_VERSION,
  };
  let url: string;
  if (existingUrl) {
    url = resolveTusLocation(endpoint, existingUrl);
  } else {
    // Retry only explicit transient HTTP responses. A thrown POST may have
    // created a session whose response was lost; don't blindly create another.
    const createHeaders = {
      ...common,
      'Upload-Length': String(fileSize),
      'Upload-Metadata': encodeTusMetadata({
        bucketName: params.bucket, objectName: params.objectPath,
        contentType: params.mimeType, cacheControl: '3600',
      }),
      'x-upsert': 'true',
    };
    let createdUrl: string | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const created = await transport.request('POST', endpoint, createHeaders);
      if (created.status === 201) {
        createdUrl = resolveTusLocation(endpoint, created.headers.location ?? null);
        break;
      }
      if (!isRetryableTusStatus(created.status)) {
        throw new Error(`Could not start resumable upload (HTTP ${created.status}).`);
      }
      if (attempt === 2) throw new Error(`Could not start resumable upload (HTTP ${created.status}).`);
      await new Promise<void>(resolve => setTimeout(resolve, 400 * (attempt + 1)));
    }
    if (!createdUrl) throw new Error('Could not start resumable upload.');
    url = createdUrl;
  }

  // HEAD is our source of truth after ambiguous PATCH responses. Transient
  // HEAD failures must not cause the whole video to fail or resend a chunk
  // whose response was lost. Never retry authentication/validation failures.
  const getOffset = async () => {
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const response = await transport.request('HEAD', url, common);
        if (response.status === 200 || response.status === 204) {
          return parseTusOffset(response.headers['upload-offset'] ?? null, fileSize);
        }
        if (!isRetryableTusStatus(response.status)) {
          throw Object.assign(
            new Error(`Could not resume video upload (HTTP ${response.status}).`),
            { fatalTus: true },
          );
        }
      } catch (error) {
        if ((error as Error & { fatalTus?: boolean }).fatalTus) throw error;
        if (attempt === 3) throw error;
      }
      if (attempt === 3) break;
      await new Promise<void>(resolve => setTimeout(resolve, 400 * (attempt + 1)));
    }
    throw new Error('Could not confirm how much of the video reached storage.');
  };

  let offset = await getOffset();
  params.onProgress?.(offset / fileSize);
  while (offset < fileSize) {
    const length = tusChunkLength(offset, fileSize);
    if (length > TUS_CHUNK_BYTES) throw new Error('Invalid resumable chunk length.');
    const bytes = await transport.readChunk(offset, length);
    if (bytes.byteLength !== length) throw new Error('Could not read the complete video chunk.');
    let completed = false;
    for (let attempt = 0; attempt < 3 && !completed; attempt++) {
      try {
        const response = await transport.request('PATCH', url, {
          ...common,
          'Content-Type': 'application/offset+octet-stream',
          'Upload-Offset': String(offset),
        }, bytes);
        if (response.status === 204) {
          const confirmed = parseTusOffset(response.headers['upload-offset'] ?? null, fileSize);
          if (confirmed !== offset + length) throw new Error('Unexpected resumable upload offset.');
          offset = confirmed;
          completed = true;
        } else if (!isRetryableTusStatus(response.status) && response.status !== 409) {
          // Permission/validation errors cannot be repaired by retrying.
          throw Object.assign(new Error(`Video upload failed (HTTP ${response.status}).`), { fatalTus: true });
        }
      } catch (error) {
        if ((error as Error & { fatalTus?: boolean }).fatalTus) throw error;
        // A lost PATCH response on the final attempt may still mean the
        // server committed the bytes. Always reconcile via HEAD first.
      }
      if (!completed) {
        // The server may have accepted the chunk before the response was lost.
        // Reconcile via HEAD before considering a retransmission.
        const confirmed = await getOffset();
        if (confirmed === offset + length) {
          offset = confirmed;
          completed = true;
        } else if (confirmed !== offset) {
          throw new Error('Storage returned an unexpected partial chunk offset.');
        }
        if (!completed && attempt === 2) throw new Error('Video upload interrupted after retries.');
        if (!completed) await new Promise<void>(resolve => setTimeout(resolve, 400 * (attempt + 1)));
      }
    }
    params.onProgress?.(offset / fileSize);
  }
  return url;
}
