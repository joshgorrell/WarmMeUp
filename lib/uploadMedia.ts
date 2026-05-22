import { supabase } from './supabase';

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
};

export async function uploadMediaFile(
  localUri: string,
  bucket: string,
  storagePath: string,
  mimeType: string,
  onProgress?: (pct: number) => void,
): Promise<UploadResult> {
  // getUser() validates the token server-side and triggers a refresh if expired,
  // then we re-read the session to get the freshened access_token.
  await supabase.auth.getUser();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  onProgress?.(0);

  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
  const uploadUrl = `${supabaseUrl}/storage/v1/object/${bucket}/${storagePath}`;

  // React Native's fetch() cannot open local file:// or ph:// URIs — only HTTP/HTTPS.
  // Use XMLHttpRequest with responseType='blob' for local paths (camera/library picks);
  // keep fetch for HTTP/HTTPS (e.g. signed URLs used in the auto-save flow).
  const blob = await readAsBlob(localUri);

  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
      'Content-Type': mimeType,
      'x-upsert': 'true',
    },
    body: blob,
  });

  if (!response.ok) {
    let msg = 'Upload failed. Please check your connection and try again.';
    try {
      const body = await response.json();
      if (response.status === 403 || body?.error === 'Unauthorized') {
        msg = 'Upload not allowed. Please try again.';
      } else if (body?.error === 'EntityTooLarge' || response.status === 413) {
        msg = 'File is too large. Please choose a smaller file.';
      }
      console.warn('[uploadMediaFile] storage error:', response.status, body);
    } catch {}
    throw new Error(msg);
  }

  onProgress?.(100);
  return { storagePath };
}

/** Picker options shared between Vault and Chat to keep quality/size consistent */
export const PICKER_OPTIONS = {
  mediaTypes: ['images', 'videos'] as any,
  quality: 0.8,
  videoMaxDuration: 60,
  allowsEditing: false,
  exportsVideoAsCopy: true,
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
