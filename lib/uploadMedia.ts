import { supabase } from './supabase';
import { logDebugEvent } from './debugLog';
import { Platform } from 'react-native';
import { cleanupTempFile } from './mediaCache';

function readAsBlob(uri: string): Promise<Blob> {
  if (!uri.startsWith('file://') && !uri.startsWith('ph://') && !uri.startsWith('content://')) {
    return fetch(uri).then(r => r.blob());
  }
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.responseType = 'blob';
    xhr.onload = () => resolve(xhr.response as Blob);
    xhr.onerror = () => reject(new Error('Could not read local media file.'));
    xhr.open('GET', uri);
    xhr.send();
  });
}

export type UploadResult = {
  storagePath: string;
  thumbnailPath?: string;
};

async function compressImage(uri: string, mimeType: string): Promise<{ uri: string; mimeType: string }> {
  if (Platform.OS === 'web') return { uri, mimeType };
  const needsConversion = mimeType === 'image/heic' || mimeType === 'image/heif' || mimeType === 'image/heif-sequence';
  if (!needsConversion && !mimeType.startsWith('image/')) return { uri, mimeType };
  try {
    const { manipulateAsync, SaveFormat } = await import('expo-image-manipulator');
    const result = await manipulateAsync(
      uri,
      [{ resize: { width: 1600 } }],
      { compress: 0.72, format: SaveFormat.JPEG },
    );
    return { uri: result.uri, mimeType: 'image/jpeg' };
  } catch {
    return { uri, mimeType };
  }
}

async function extractVideoThumbnail(uri: string): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    const { getThumbnailAsync } = await import('expo-video-thumbnails');
    const result = await getThumbnailAsync(uri, { time: 0, quality: 0.6 });
    return result.uri;
  } catch {
    return null;
  }
}

function mapStorageError(
  status: number,
  body: { error?: string; message?: string; statusCode?: string } | null,
): string {
  if (status === 401) return 'Session expired — please log out and back in.';
  if (status === 403 || body?.error === 'Unauthorized') return 'Upload permission denied. Check that your account is active and paired.';
  if (status === 413 || body?.error === 'EntityTooLarge') return 'File too large (max 100 MB).';
  if (status === 415 || body?.error === 'invalid_mime_type') return 'Unsupported file format.';
  if (status >= 500) return 'Storage temporarily unavailable — please try again.';
  if (body?.message) return `Upload failed: ${body.message}`;
  if (body?.error) return `Upload failed: ${body.error}`;
  return `Upload failed (HTTP ${status}).`;
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
  const { data: { session: initialSession } } = await supabase.auth.getSession();
  let session = initialSession;
  if (!session) {
    await supabase.auth.getUser();
    const { data: { session: refreshed } } = await supabase.auth.getSession();
    if (!refreshed) {
      logDebugEvent('VAULT UPLOAD ERROR', {
        reason: 'No active session',
        bucket, storagePath, mimeType, userId: userId ?? null, coupleId: coupleId ?? null,
      });
      throw new Error('Session expired — please log out and back in.');
    }
    session = refreshed;
  }

  const sessionValid = !!session;
  const tokenPresent = !!session?.access_token;

  onProgress?.(0);

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

  if (isPhoto) {
    const compressed = await compressImage(localUri, normalizedMime);
    uploadUri = compressed.uri;
    uploadMime = compressed.mimeType;
    if (uploadMime !== normalizedMime) {
      uploadStoragePath = storagePath.replace(/\.\w+$/, '.jpg');
    }
  }

  if (isVideo) {
    const expectedExt = mimeToExtension(uploadMime);
    if (/\.\w+$/.test(uploadStoragePath)) {
      uploadStoragePath = uploadStoragePath.replace(/\.\w+$/, `.${expectedExt}`);
    } else {
      uploadStoragePath = `${uploadStoragePath}.${expectedExt}`;
    }
  }

  if (isVideo && bucket === 'vault') {
    const thumbUri = await extractVideoThumbnail(localUri);
    if (thumbUri) {
      thumbnailLocalUri = thumbUri;
      const thumbStoragePath = uploadStoragePath.replace(/\.\w+$/, '_thumb.jpg');
      try {
        const thumbBlob = await readAsBlob(thumbUri);
        await fetch(
          `${process.env.EXPO_PUBLIC_SUPABASE_URL}/storage/v1/object/vault/${thumbStoragePath}`,
          {
            method: 'PUT',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
              'apikey': process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
              'Content-Type': 'image/jpeg',
              'x-upsert': 'true',
            },
            body: thumbBlob,
          },
        );
        thumbnailPath = thumbStoragePath;
      } catch {}
    }
  }

  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
  const uploadUrl = `${supabaseUrl}/storage/v1/object/${bucket}/${uploadStoragePath}`;

  let blob: Blob;
  try {
    blob = await readAsBlob(uploadUri);
  } catch (readErr: any) {
    logDebugEvent('VAULT UPLOAD ERROR', {
      reason: 'Failed to read local file',
      error: readErr?.message ?? String(readErr),
      bucket, storagePath, mimeType: uploadMime, userId: userId ?? null, coupleId: coupleId ?? null,
    });
    throw new Error('Could not read media file — please try again.');
  }

  const blobSize = blob.size;

  logDebugEvent('VAULT UPLOAD START', {
    bucket,
    storagePath: uploadStoragePath,
    mimeType: uploadMime,
    blobSize,
    userId: userId ?? null,
    coupleId: coupleId ?? null,
    sessionValid,
    tokenPresent,
  });

  let response: Response;
  try {
    response = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
        'Content-Type': uploadMime,
        'x-upsert': 'true',
      },
      body: blob,
    });
  } catch (networkErr: any) {
    logDebugEvent('VAULT UPLOAD ERROR', {
      reason: 'Network error',
      error: networkErr?.message ?? String(networkErr),
      bucket, storagePath: uploadStoragePath, mimeType: uploadMime, blobSize, userId: userId ?? null, coupleId: coupleId ?? null,
    });
    throw new Error('Network error — check your connection and try again.');
  }

  if (!response.ok) {
    let body: { error?: string; message?: string; statusCode?: string } | null = null;
    try { body = await response.json(); } catch {}

    logDebugEvent('VAULT UPLOAD ERROR', {
      httpStatus: response.status,
      supabaseError: body?.error ?? null,
      supabaseMessage: body?.message ?? null,
      supabaseStatusCode: body?.statusCode ?? null,
      bucket,
      storagePath: uploadStoragePath,
      mimeType: uploadMime,
      blobSize,
      userId: userId ?? null,
      coupleId: coupleId ?? null,
      sessionValid,
      tokenPresent,
    });

    throw new Error(mapStorageError(response.status, body));
  }

  logDebugEvent('VAULT UPLOAD SUCCESS', {
    bucket,
    storagePath: uploadStoragePath,
    mimeType: uploadMime,
    blobSize,
    userId: userId ?? null,
    coupleId: coupleId ?? null,
  });

  onProgress?.(100);

  if (isPhoto && uploadUri !== localUri) {
    cleanupTempFile(uploadUri).catch(() => {});
  }
  if (isVideo && bucket === 'vault' && thumbnailLocalUri) {
    cleanupTempFile(thumbnailLocalUri).catch(() => {});
  }

  return { storagePath: uploadStoragePath, thumbnailPath };
}

export function extensionToMime(ext: string): string {
  switch (ext) {
    case 'heic':
    case 'heif': return 'image/heic';
    case 'png':  return 'image/png';
    case 'webp': return 'image/webp';
    case 'gif':  return 'image/gif';
    case 'mov':
    case 'm4v':  return 'video/quicktime';
    case 'mp4':  return 'video/mp4';
    default:     return 'image/jpeg';
  }
}

export function mimeToExtension(mimeType: string): string {
  switch (mimeType.toLowerCase()) {
    case 'image/heic':
    case 'image/heif':
    case 'image/heif-sequence': return 'heic';
    case 'image/png':           return 'png';
    case 'image/webp':          return 'webp';
    case 'image/gif':           return 'gif';
    case 'video/quicktime':
    case 'video/x-m4v':         return 'mov';
    case 'video/mp4':           return 'mp4';
    default:                    return mimeType.startsWith('video/') ? 'mov' : 'jpg';
  }
}

export const PICKER_OPTIONS = {
  mediaTypes: ['images', 'videos'] as any,
  quality: 0.6,
  videoMaxDuration: 60,
  allowsEditing: false,
  exportsVideoAsCopy: true,
  flashMode: 'off' as const,
};

export function resolveAssetMimeType(asset: { mimeType?: string | null; type?: string | null }): string {
  const raw = asset.mimeType?.toLowerCase() ?? '';
  if (raw === 'video/hevc' || raw === 'video/x-m4v' || raw === 'video/mpeg') {
    return 'video/quicktime';
  }
  if (raw) return raw;
  return asset.type === 'video' ? 'video/quicktime' : 'image/jpeg';
}
