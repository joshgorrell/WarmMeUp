import { supabase } from './supabase';
import { logDebugEvent } from './debugLog';
import { Image as ReactNativeImage, Platform } from 'react-native';
import { cleanupTempFile } from './mediaCache';
import { beginUploadProgress, cancelUploadProgress, finishUploadProgress, setUploadProgressPct } from './uploadProgress';

export type UploadResult = { storagePath: string; thumbnailPath?: string };

function isLocalUri(uri: string): boolean {
  return uri.startsWith('file://') || uri.startsWith('ph://') || uri.startsWith('content://');
}

async function buildUploadBody(uri: string, _mimeType: string): Promise<Blob | ArrayBuffer> {
  const response = await fetch(uri);
  if (!response.ok) {
    throw new Error('Could not read media file — please try again.');
  }
  return Platform.OS === 'web' ? response.blob() : response.arrayBuffer();
}

async function uploadToStorage(
  url: string,
  body: Blob | ArrayBuffer,
  headers: Record<string, string>,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);
  try {
    return await fetch(url, { method: 'PUT', headers, body, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function getImageDimensions(uri: string): Promise<{ width: number; height: number } | null> {
  return new Promise(resolve => {
    ReactNativeImage.getSize(uri, (width, height) => resolve({ width, height }), () => resolve(null));
  });
}

// Retry only transient upload failures. Each retry uses the same object path (upsert),
// so a successful but interrupted response cannot create duplicate media objects.
async function uploadWithRetry(
  url: string,
  body: Blob | ArrayBuffer,
  headers: Record<string, string>,
): Promise<Response> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await uploadToStorage(url, body, headers);
      if (![408, 429, 500, 502, 503, 504].includes(response.status) || attempt === 2) return response;
    } catch (error) {
      if (attempt === 2) throw error;
    }
    await new Promise<void>(resolve => setTimeout(resolve, 700 * (attempt + 1)));
  }
  throw new Error('Upload could not be completed.');
}

async function compressImage(uri: string, mimeType: string): Promise<{ uri: string; mimeType: string }> {
  if (Platform.OS === 'web') return { uri, mimeType };
  // Do not flatten animations or silently convert transparent PNGs to opaque JPEGs.
  if (mimeType === 'image/gif' || mimeType === 'image/webp' || mimeType === 'image/png') return { uri, mimeType };
  if (!mimeType.startsWith('image/')) return { uri, mimeType };
  const needsConversion = ['image/heic', 'image/heif', 'image/heif-sequence'].includes(mimeType);
  const dimensions = await getImageDimensions(uri);
  // Unknown dimensions: preserve a supported JPEG instead of risking unnecessary resampling.
  if (!dimensions && !needsConversion) return { uri, mimeType };
  const resize = dimensions && Math.max(dimensions.width, dimensions.height) > 2048
    ? [{ resize: dimensions.width >= dimensions.height ? { width: 2048 } : { height: 2048 } }]
    : [];
  if (resize.length === 0 && !needsConversion) return { uri, mimeType };
  try {
    const { manipulateAsync, SaveFormat } = await import('expo-image-manipulator');
    const result = await manipulateAsync(uri, resize, { compress: 0.9, format: SaveFormat.JPEG });
    return { uri: result.uri, mimeType: 'image/jpeg' };
  } catch {
    return { uri, mimeType };
  }
}

async function generatePhotoThumbnail(uri: string): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    const { manipulateAsync, SaveFormat } = await import('expo-image-manipulator');
    const dimensions = await getImageDimensions(uri);
    const actions = dimensions && Math.max(dimensions.width, dimensions.height) <= 360
      ? []
      : [{ resize: dimensions && dimensions.height > dimensions.width ? { height: 360 } : { width: 360 } }];
    const result = await manipulateAsync(
      uri,
      actions,
      { compress: 0.7, format: SaveFormat.JPEG },
    );
    return result.uri;
  } catch {
    return null;
  }
}

async function extractVideoThumbnail(uri: string): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    const { getThumbnailAsync } = await import('expo-video-thumbnails');
    try {
      const result = await getThumbnailAsync(uri, { time: 200, quality: 0.85 });
      return result.uri;
    } catch {
      const result = await getThumbnailAsync(uri, { time: 0, quality: 0.85 });
      return result.uri;
    }
  } catch {
    return null;
  }
}

function mapStorageError(status: number, body: { error?: string; message?: string; statusCode?: string } | null): string {
  if (status === 401) return 'Session expired — please log out and back in.';
  if (status === 403 || body?.error === 'Unauthorized') return 'Upload permission denied. Check that your account is active and paired.';
  if (status === 413 || body?.error === 'EntityTooLarge') return 'Video or photo exceeds the storage upload limit. Please choose a smaller file.';
  if (status === 415 || body?.error === 'invalid_mime_type') return 'Unsupported file format.';
  if (status >= 500) return 'Storage temporarily unavailable — please try again.';
  if (body?.message) return `Upload failed: ${body.message}`;
  if (body?.error) return `Upload failed: ${body.error}`;
  return `Upload failed (HTTP ${status}).`;
}

// XHR exposes real bytes sent. Unlike a timer, the percentage does not advance
// while the network is stalled. Use only for the primary media transfer.
async function uploadWithMeasuredProgress(
  url: string,
  body: Blob | ArrayBuffer,
  headers: Record<string, string>,
  onBytes: (loaded: number, total: number) => void,
  timeoutMs = 90_000,
): Promise<Response> {
  return new Promise<Response>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url, true);
    xhr.timeout = timeoutMs;
    Object.entries(headers).forEach(([key, value]) => xhr.setRequestHeader(key, value));
    xhr.upload.onprogress = event => {
      if (event.lengthComputable && event.total > 0) onBytes(event.loaded, event.total);
    };
    xhr.onerror = () => reject(new Error('Network connection lost during upload.'));
    xhr.ontimeout = () => reject(new Error('Upload timed out — please try again.'));
    xhr.onabort = () => reject(new Error('Upload was interrupted.'));
    xhr.onload = () => {
      if (xhr.status === 0) { reject(new Error('Network connection lost during upload.')); return; }
      const responseBody = xhr.responseText ?? '';
      resolve(new Response(responseBody, { status: xhr.status, statusText: xhr.statusText }));
    };
    try { xhr.send(body as any); } catch (error) { reject(error); }
  });
}

// Native video uploads stream from the sandboxed file rather than first copying
// the entire video into a JavaScript ArrayBuffer. The SDK reports real bytes sent.
async function uploadNativeFileWithProgressRetry(
  url: string,
  uri: string,
  headers: Record<string, string>,
  onProgress: (fraction: number) => void,
): Promise<{ status: number; body: string }> {
  const FileSystem = await import('expo-file-system/legacy');
  for (let attempt = 0; attempt < 3; attempt++) {
    onProgress(0);
    let acceptProgress = true;
    try {
      const task = FileSystem.createUploadTask(
        url, uri,
        { httpMethod: 'PUT', uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT, headers },
        event => {
          if (acceptProgress && event.totalBytesExpectedToSend > 0) {
            onProgress(Math.min(1, event.totalBytesSent / event.totalBytesExpectedToSend));
          }
        },
      );
      // Native upload tasks do not honor the XHR timeout. Bound each attempt
      // separately, and cancel the native transfer before retrying.
      let timeout: ReturnType<typeof setTimeout> | undefined;
      let timedOut = false;
      let transferSettled = false;
      try {
        const transfer = task.uploadAsync();
        // Ignore progress from a timed-out attempt while cancellation settles.
        const result = await Promise.race([
          transfer.then(value => {
            transferSettled = true;
            return value;
          }, error => {
            transferSettled = true;
            throw error;
          }),
          new Promise<never>((_, reject) => {
            timeout = setTimeout(() => {
              if (transferSettled) return;
              timedOut = true;
              reject(new Error('Video upload timed out — please try again.'));
            }, 300_000);
          }),
        ]);
        if (!result) throw new Error('Upload was interrupted.');
        if (![408, 429, 500, 502, 503, 504].includes(result.status) || attempt === 2) {
          return { status: result.status, body: result.body ?? '' };
        }
      } finally {
        acceptProgress = false;
        if (timeout) clearTimeout(timeout);
        if (timedOut) {
          // A cancellation failure means the previous transfer may still be
          // writing to this object. Never start a competing retry.
          try {
            await task.cancelAsync();
          } catch {
            throw new Error('Video upload stopped responding. Please retry after checking your connection.');
          }
          onProgress(0);
        }
      }

    } catch (error) {
      // Do not retry when we cannot prove the previous native task stopped.
      if (attempt === 2 || (error instanceof Error && error.message.startsWith('Video upload stopped responding.'))) throw error;
    }
    await new Promise<void>(resolve => setTimeout(resolve, 700 * (attempt + 1)));
  }
  throw new Error('Upload could not be completed.');
}

async function uploadWithProgressRetry(
  url: string,
  body: Blob | ArrayBuffer,
  headers: Record<string, string>,
  onProgress: (fraction: number) => void,
  timeoutMs = 90_000,
): Promise<Response> {
  for (let attempt = 0; attempt < 3; attempt++) {
    onProgress(0);
    try {
      const response = await uploadWithMeasuredProgress(url, body, headers, (loaded, total) => {
        onProgress(Math.min(1, loaded / total));
      }, timeoutMs);
      if (![408, 429, 500, 502, 503, 504].includes(response.status) || attempt === 2) return response;
    } catch (error) {
      if (attempt === 2) throw error;
    }
    await new Promise<void>(resolve => setTimeout(resolve, 700 * (attempt + 1)));
  }
  throw new Error('Upload could not be completed.');
}

export function videoThumbnailPath(storagePath: string): string {
  return /\.\w+$/.test(storagePath)
    ? storagePath.replace(/\.\w+$/, '_thumb.jpg')
    : `${storagePath}_thumb.jpg`;
}

export async function uploadMediaFile(
  localUri: string,
  bucket: string,
  storagePath: string,
  mimeType: string,
  onProgress?: (pct: number) => void,
  userId?: string,
  coupleId?: string,
): Promise<UploadResult> {
  const showGlobalProgress = !!onProgress;
  if (showGlobalProgress) beginUploadProgress(bucket === 'vault' ? 'Uploading to Vault…' : 'Sending media…');
  const reportProgress = (pct: number) => {
    onProgress?.(pct);
    if (showGlobalProgress) setUploadProgressPct(pct);
  };

  const tempFiles = new Set<string>([localUri]);
  let pendingThumbPromise: Promise<string | null> | null = null;

  try {
    const { data: { session: initialSession } } = await supabase.auth.getSession();
    let session = initialSession;
    if (!session) {
      await supabase.auth.getUser();
      const { data: { session: refreshed } } = await supabase.auth.getSession();
      if (!refreshed) throw new Error('Session expired — please log out and back in.');
      session = refreshed;
    }

    reportProgress(2);

    let normalizedMime = mimeType.toLowerCase();
    if (normalizedMime === 'video/hevc' || normalizedMime === 'video/x-m4v' || normalizedMime === 'video/mpeg') {
      normalizedMime = 'video/quicktime';
    }

    const isPhoto = normalizedMime.startsWith('image/');
    const isVideo = normalizedMime.startsWith('video/');
    const preserveAnimatedImage = normalizedMime === 'image/gif' || normalizedMime === 'image/webp';
    let uploadUri = localUri;
    let uploadMime = normalizedMime;
    let uploadStoragePath = storagePath;
    let thumbnailPath: string | undefined;
    let thumbnailLocalUri: string | null = null;


    if (isPhoto) {
      reportProgress(5);
      const compressed = await compressImage(localUri, normalizedMime);
      uploadUri = compressed.uri; tempFiles.add(uploadUri);
      uploadMime = compressed.mimeType;
      if (uploadMime !== normalizedMime) uploadStoragePath = storagePath.replace(/\.\w+$/, '.jpg');
    }

    if (isVideo) {
      const expectedExt = mimeToExtension(uploadMime);
      uploadStoragePath = /\.\w+$/.test(uploadStoragePath)
        ? uploadStoragePath.replace(/\.\w+$/, `.${expectedExt}`)
        : `${uploadStoragePath}.${expectedExt}`;


    }

    const uploadUrl = `${process.env.EXPO_PUBLIC_SUPABASE_URL!}/storage/v1/object/${bucket}/${uploadStoragePath}`;

    logDebugEvent('VAULT UPLOAD START', {
      bucket,
      storagePath: uploadStoragePath,
      mimeType: uploadMime,
      userId: userId ?? null,
      coupleId: coupleId ?? null,
    });

    // Read the main photo into memory BEFORE generating the thumbnail.
    // This avoids two concurrent reads of the same compressed file which can deadlock on native.
    let body: Blob | ArrayBuffer | null = null;
    if (!(isVideo && Platform.OS !== 'web' && uploadUri.startsWith('file://'))) {
      try {
        body = await buildUploadBody(uploadUri, uploadMime);
      } catch {
        throw new Error('Could not read media file — please try again.');
      }
    }

    // Prepare video posters after reading the main file so native file reads do not contend.
    // Upload the poster alongside the video rather than delaying the video transfer.
    if (isVideo) {
      const thumbStoragePath = videoThumbnailPath(uploadStoragePath);
      pendingThumbPromise = (async () => {
        const thumbUri = await extractVideoThumbnail(localUri);
        if (!thumbUri) return null;
        thumbnailLocalUri = thumbUri;
        tempFiles.add(thumbUri);
        try {
          const thumbBody = await buildUploadBody(thumbUri, 'image/jpeg');
          const thumbResponse = await uploadWithRetry(
            `${process.env.EXPO_PUBLIC_SUPABASE_URL}/storage/v1/object/${bucket}/${thumbStoragePath}`,
            thumbBody,
            {
              Authorization: `Bearer ${session.access_token}`,
              apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
              'Content-Type': 'image/jpeg',
              'x-upsert': 'true',
            },
          );
          return thumbResponse.ok ? thumbStoragePath : null;
        } catch {
          return null;
        }
      })();
    }

    // Now that the main body is fully loaded, generate + upload the thumbnail in parallel
    // with the main network upload. Animated images must use the original file in Chat,
    // otherwise a JPEG thumbnail would replace the animation.
    if (isPhoto && !preserveAnimatedImage) {
      const thumbStoragePath = videoThumbnailPath(uploadStoragePath);
      pendingThumbPromise = (async () => {
        const thumbUri = await generatePhotoThumbnail(uploadUri);
        if (!thumbUri) return null;
        thumbnailLocalUri = thumbUri; tempFiles.add(thumbUri);
        try {
          const thumbBody = await buildUploadBody(thumbUri, 'image/jpeg');
          const thumbResponse = await uploadWithRetry(
            `${process.env.EXPO_PUBLIC_SUPABASE_URL}/storage/v1/object/${bucket}/${thumbStoragePath}`,
            thumbBody,
            {
              Authorization: `Bearer ${session.access_token}`,
              apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
              'Content-Type': 'image/jpeg',
              'x-upsert': 'true',
            },
          );
          if (thumbResponse.ok) return thumbStoragePath;
        } catch {}
        return null;
      })();
    }

    reportProgress(8);

    let uploadStatus: number;
    let uploadErrorBody = '';
    const headers = {
      Authorization: `Bearer ${session.access_token}`,
      apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
      'Content-Type': uploadMime,
      'x-upsert': 'true',
    };
    try {
      if (isVideo && Platform.OS !== 'web' && uploadUri.startsWith('file://')) {
        const result = await uploadNativeFileWithProgressRetry(
          uploadUrl, uploadUri, headers,
          fraction => reportProgress(8 + Math.floor(fraction * 84)),
        );
        uploadStatus = result.status;
        uploadErrorBody = result.body;
      } else {
        if (!body) throw new Error('Media file could not be loaded.');
        const response = await uploadWithProgressRetry(
          uploadUrl, body, headers,
          fraction => reportProgress(8 + Math.floor(fraction * 84)),
          isVideo ? 300_000 : 90_000,
        );
        uploadStatus = response.status;
        if (!response.ok) uploadErrorBody = await response.text();
      }
    } catch (networkErr: any) {
      throw new Error(networkErr?.message ? `Network error — ${networkErr.message}` : 'Network error — check your connection and try again.');
    }

    if (uploadStatus < 200 || uploadStatus >= 300) {
      let errBody: { error?: string; message?: string; statusCode?: string } | null = null;
      try { errBody = JSON.parse(uploadErrorBody); } catch {}
      throw new Error(mapStorageError(uploadStatus, errBody));
    }

    // Await the thumbnail upload that was running alongside the main media
    if (pendingThumbPromise) {
      try {
        const thumbResult = await pendingThumbPromise;
        if (thumbResult) thumbnailPath = thumbResult;
      } catch {}
    }

    reportProgress(96);
    logDebugEvent('VAULT UPLOAD SUCCESS', {
      bucket,
      storagePath: uploadStoragePath,
      mimeType: uploadMime,
      userId: userId ?? null,
      coupleId: coupleId ?? null,
    });

    if (uploadUri !== localUri) tempFiles.add(uploadUri);
    if (thumbnailLocalUri) tempFiles.add(thumbnailLocalUri);

    reportProgress(100);
    if (showGlobalProgress) finishUploadProgress();
    return { storagePath: uploadStoragePath, thumbnailPath };
  } catch (error) {
    if (showGlobalProgress) cancelUploadProgress();
    throw error;
  } finally {
    await pendingThumbPromise?.catch(() => null);
    await Promise.all([...tempFiles].map(cleanupTempFile));
  }
}

export function extensionToMime(ext: string): string {
  switch (ext) {
    case 'heic': case 'heif': return 'image/heic';
    case 'png': return 'image/png';
    case 'webp': return 'image/webp';
    case 'gif': return 'image/gif';
    case 'mov': case 'm4v': return 'video/quicktime';
    case 'mp4': return 'video/mp4';
    default: return 'image/jpeg';
  }
}

export function mimeToExtension(mimeType: string): string {
  switch (mimeType.toLowerCase()) {
    case 'image/heic': case 'image/heif': case 'image/heif-sequence': return 'heic';
    case 'image/png': return 'png';
    case 'image/webp': return 'webp';
    case 'image/gif': return 'gif';
    case 'video/quicktime': case 'video/x-m4v': return 'mov';
    case 'video/mp4': return 'mp4';
    default: return mimeType.startsWith('video/') ? 'mov' : 'jpg';
  }
}

export const PICKER_OPTIONS = {
  mediaTypes: ['images', 'videos'] as any,
  quality: 1,
  videoMaxDuration: 60,
  allowsEditing: false,
  exportsVideoAsCopy: true,
  flashMode: 'off' as const,
};

export function resolveAssetMimeType(asset: { mimeType?: string | null; type?: string | null }): string {
  const raw = asset.mimeType?.toLowerCase() ?? '';
  if (raw === 'video/hevc' || raw === 'video/x-m4v' || raw === 'video/mpeg') return 'video/quicktime';
  if (raw) return raw;
  return asset.type === 'video' ? 'video/quicktime' : 'image/jpeg';
}
