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

/**
 * Compress a local image URI to JPEG at ≤1600px on the long edge, quality 0.72.
 * Falls back to the original URI if expo-image-manipulator is unavailable (e.g. web).
 * Returns the compressed local URI and the resolved MIME type (always image/jpeg after compression).
 */
async function compressImage(uri: string, mimeType: string): Promise<{ uri: string; mimeType: string }> {
  if (Platform.OS === 'web') return { uri, mimeType };
  // HEIC/HEIF must be converted — they can't be read back as blobs on all devices.
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

/**
 * Generate a JPEG thumbnail frame from a local video URI.
 * Returns null if expo-video-thumbnails is unavailable or fails.
 */
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
  // Try getSession() first (local, no network) — only call getUser() (which
  // validates the token server-side and can trigger a refresh) if the session
  // is missing. This avoids a network round-trip on every upload.
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

  // ── Compress images before upload ────────────────────────────────────────
  const isPhoto = mimeType.startsWith('image/');
  const isVideo = mimeType.startsWith('video/');
  let uploadUri = localUri;
  let uploadMime = mimeType;
  let uploadStoragePath = storagePath;
  let thumbnailPath: string | undefined;
  let thumbnailLocalUri: string | null = null;

  if (isPhoto) {
    const compressed = await compressImage(localUri, mimeType);
    uploadUri = compressed.uri;
    uploadMime = compressed.mimeType;
    // If MIME changed (HEIC → JPEG), update the storage path extension too.
    if (uploadMime !== mimeType) {
      uploadStoragePath = storagePath.replace(/\.\w+$/, '.jpg');
    }
  }

  // ── Extract and upload video thumbnail ───────────────────────────────────
  if (isVideo && bucket === 'vault') {
    const thumbUri = await extractVideoThumbnail(localUri);
    if (thumbUri) {
      thumbnailLocalUri = thumbUri;
      const thumbStoragePath = storagePath.replace(/\.\w+$/, '_thumb.jpg');
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
      } catch {
        // Thumbnail upload is best-effort — don't block the main upload
      }
    }
  }

  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
  const uploadUrl = `${supabaseUrl}/storage/v1/object/${bucket}/${uploadStoragePath}`;

  // React Native's fetch() cannot open local file:// or ph:// URIs — only HTTP/HTTPS.
  // Use XMLHttpRequest with responseType='blob' for local paths (camera/library picks);
  // keep fetch for HTTP/HTTPS (e.g. signed URLs used in the auto-save flow).
  let blob: Blob;
  try {
    blob = await readAsBlob(uploadUri);
  } catch (readErr: any) {
    logDebugEvent('VAULT UPLOAD ERROR', {
      reason: 'Failed to read local file',
      error: readErr?.message ?? String(readErr),
      bucket, storagePath, mimeType, userId: userId ?? null, coupleId: coupleId ?? null,
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

  // Clean up temp files created during upload (compressed image copy, video thumbnail).
  // These live in the app's sandboxed cache — safe to delete. Original photo-library
  // references (ph://, content://) are never touched.
  if (isPhoto && uploadUri !== localUri) {
    cleanupTempFile(uploadUri).catch(() => {});
  }
  if (isVideo && bucket === 'vault' && thumbnailLocalUri) {
    cleanupTempFile(thumbnailLocalUri).catch(() => {});
  }

  return { storagePath: uploadStoragePath, thumbnailPath };
}

/** Infer MIME type from a file extension (lower-case, no dot). */
export function extensionToMime(ext: string): string {
  switch (ext) {
    case 'heic':
    case 'heif': return 'image/heic';
    case 'png':  return 'image/png';
    case 'webp': return 'image/webp';
    case 'gif':  return 'image/gif';
    case 'mov':  return 'video/quicktime';
    case 'mp4':  return 'video/mp4';
    default:     return 'image/jpeg';
  }
}

/** Derive the correct file extension from a resolved MIME type. */
export function mimeToExtension(mimeType: string): string {
  switch (mimeType) {
    case 'image/heic':
    case 'image/heif':
    case 'image/heif-sequence': return 'heic';
    case 'image/png':           return 'png';
    case 'image/webp':          return 'webp';
    case 'image/gif':           return 'gif';
    case 'video/quicktime':     return 'mov';
    case 'video/mp4':           return 'mp4';
    default:                    return mimeType.startsWith('video/') ? 'mov' : 'jpg';
  }
}

/** Picker options shared between Vault and Chat to keep quality/size consistent */
export const PICKER_OPTIONS = {
  mediaTypes: ['images', 'videos'] as any,
  quality: 0.6,
  videoMaxDuration: 60,
  allowsEditing: false,
  exportsVideoAsCopy: true,
  flashMode: 'off' as const,
};

/**
 * Resolve the correct MIME type from an expo-image-picker asset, normalising
 * iOS-specific types to what the Supabase storage buckets allow.
 *
 * Normalisations applied:
 *   video/hevc, video/x-m4v, video/mpeg → video/quicktime
 *     (iOS camera records MOV/QuickTime; map non-standard variants to the
 *     canonical type the bucket accepts instead of video/mp4 which won't match
 *     the actual bytes)
 *
 * HEIC/HEIF images are passed through unchanged — the vault bucket explicitly
 * allows image/heic, image/heif, and image/heif-sequence, so remapping them to
 * image/jpeg causes a MIME mismatch that Supabase rejects.
 */
export function resolveAssetMimeType(asset: { mimeType?: string | null; type?: string | null }): string {
  const raw = asset.mimeType?.toLowerCase() ?? '';
  if (raw === 'video/hevc' || raw === 'video/x-m4v' || raw === 'video/mpeg') {
    return 'video/quicktime';
  }
  if (raw) return raw;
  return asset.type === 'video' ? 'video/quicktime' : 'image/jpeg';
}
