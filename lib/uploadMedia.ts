import { supabase } from './supabase';
import { logDebugEvent } from './debugLog';
import { Platform } from 'react-native';
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
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    return await fetch(url, { method: 'PUT', headers, body, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function compressImage(uri: string, mimeType: string): Promise<{ uri: string; mimeType: string }> {
  if (Platform.OS === 'web') return { uri, mimeType };
  const needsConversion = mimeType === 'image/heic' || mimeType === 'image/heif' || mimeType === 'image/heif-sequence';
  if (!needsConversion && !mimeType.startsWith('image/')) return { uri, mimeType };
  try {
    const { manipulateAsync, SaveFormat } = await import('expo-image-manipulator');
    const result = await manipulateAsync(uri, [{ resize: { width: 1600 } }], { compress: 0.8, format: SaveFormat.JPEG });
    return { uri: result.uri, mimeType: 'image/jpeg' };
  } catch {
    return { uri, mimeType };
  }
}

async function generatePhotoThumbnail(uri: string): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    const { manipulateAsync, SaveFormat } = await import('expo-image-manipulator');
    const result = await manipulateAsync(
      uri,
      [{ resize: { width: 200 } }],
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
  if (status === 413 || body?.error === 'EntityTooLarge') return 'File too large (max 100 MB).';
  if (status === 415 || body?.error === 'invalid_mime_type') return 'Unsupported file format.';
  if (status >= 500) return 'Storage temporarily unavailable — please try again.';
  if (body?.message) return `Upload failed: ${body.message}`;
  if (body?.error) return `Upload failed: ${body.error}`;
  return `Upload failed (HTTP ${status}).`;
}

function startProgressPulse(report: (pct: number) => void): () => void {
  let pct = 8;
  report(pct);
  const timer = setInterval(() => {
    if (pct >= 90) return;
    const step = pct < 45 ? 5 : pct < 70 ? 3 : 1;
    pct = Math.min(90, pct + step);
    report(pct);
  }, 450);
  return () => clearInterval(timer);
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

  let stopPulse: (() => void) | null = null;

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
    let uploadUri = localUri;
    let uploadMime = normalizedMime;
    let uploadStoragePath = storagePath;
    let thumbnailPath: string | undefined;
    let thumbnailLocalUri: string | null = null;
    let pendingThumbPromise: Promise<string | null> | null = null;

    if (isPhoto) {
      reportProgress(5);
      const compressed = await compressImage(localUri, normalizedMime);
      uploadUri = compressed.uri;
      uploadMime = compressed.mimeType;
      if (uploadMime !== normalizedMime) uploadStoragePath = storagePath.replace(/\.\w+$/, '.jpg');
    }

    if (isVideo) {
      const expectedExt = mimeToExtension(uploadMime);
      uploadStoragePath = /\.\w+$/.test(uploadStoragePath)
        ? uploadStoragePath.replace(/\.\w+$/, `.${expectedExt}`)
        : `${uploadStoragePath}.${expectedExt}`;

      reportProgress(5);
      const thumbUri = await extractVideoThumbnail(localUri);
      if (thumbUri) {
        thumbnailLocalUri = thumbUri;
        const thumbStoragePath = videoThumbnailPath(uploadStoragePath);
        try {
          const thumbBody = await buildUploadBody(thumbUri, 'image/jpeg');
          const thumbResponse = await uploadToStorage(
            `${process.env.EXPO_PUBLIC_SUPABASE_URL}/storage/v1/object/${bucket}/${thumbStoragePath}`,
            thumbBody,
            {
              Authorization: `Bearer ${session.access_token}`,
              apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
              'Content-Type': 'image/jpeg',
              'x-upsert': 'true',
            },
          );
          if (thumbResponse.ok) thumbnailPath = thumbStoragePath;
        } catch {}
      }
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
    let body: Blob | ArrayBuffer;
    try {
      body = await buildUploadBody(uploadUri, uploadMime);
    } catch {
      throw new Error('Could not read media file — please try again.');
    }

    // Now that the main body is fully loaded, generate + upload the thumbnail in parallel
    // with the main network upload.
    if (isPhoto) {
      const thumbStoragePath = videoThumbnailPath(uploadStoragePath);
      pendingThumbPromise = (async () => {
        const thumbUri = await generatePhotoThumbnail(uploadUri);
        if (!thumbUri) return null;
        thumbnailLocalUri = thumbUri;
        try {
          const thumbBody = await buildUploadBody(thumbUri, 'image/jpeg');
          const thumbResponse = await uploadToStorage(
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

    stopPulse = startProgressPulse(reportProgress);

    let response: Response;
    try {
      response = await uploadToStorage(uploadUrl, body, {
        Authorization: `Bearer ${session.access_token}`,
        apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
        'Content-Type': uploadMime,
        'x-upsert': 'true',
      });
    } catch (networkErr: any) {
      throw new Error(networkErr?.message ? `Network error — ${networkErr.message}` : 'Network error — check your connection and try again.');
    } finally {
      stopPulse?.();
      stopPulse = null;
    }

    if (!response.ok) {
      let errBody: { error?: string; message?: string; statusCode?: string } | null = null;
      try {
        errBody = await response.json();
      } catch {}
      throw new Error(mapStorageError(response.status, errBody));
    }

    // Await the thumbnail upload that was running in parallel with the main photo
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

    if (isPhoto && uploadUri !== localUri) cleanupTempFile(uploadUri).catch(() => {});
    if (isPhoto && thumbnailLocalUri) cleanupTempFile(thumbnailLocalUri).catch(() => {});
    if (isVideo && thumbnailLocalUri) cleanupTempFile(thumbnailLocalUri).catch(() => {});

    reportProgress(100);
    if (showGlobalProgress) finishUploadProgress();
    return { storagePath: uploadStoragePath, thumbnailPath };
  } catch (error) {
    stopPulse?.();
    if (showGlobalProgress) cancelUploadProgress();
    throw error;
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
