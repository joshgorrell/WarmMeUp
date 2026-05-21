import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from './supabase';

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
  if (Platform.OS === 'web') {
    return uploadWeb(localUri, bucket, storagePath, mimeType, onProgress);
  }
  return uploadNative(localUri, bucket, storagePath, mimeType, onProgress);
}

async function uploadNative(
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

  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
  const uploadUrl = `${supabaseUrl}/storage/v1/object/${bucket}/${storagePath}`;

  const result = await FileSystem.uploadAsync(uploadUrl, localUri, {
    httpMethod: 'PUT',
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
      'Content-Type': mimeType,
      'x-upsert': 'true',
    },
    sessionType: FileSystem.FileSystemSessionType.FOREGROUND,
  });

  if (result.status < 200 || result.status >= 300) {
    let msg = 'Upload failed. Please check your connection and try again.';
    try {
      const body = JSON.parse(result.body);
      // Surface storage-specific errors in dev; keep user message friendly
      if (body?.statusCode === '403' || body?.error === 'Unauthorized') {
        msg = 'Upload not allowed. Please try again.';
      } else if (body?.error === 'EntityTooLarge' || result.status === 413) {
        msg = 'File is too large. Please choose a smaller file.';
      }
      console.warn('[uploadNative] storage error:', result.status, body);
    } catch {}
    throw new Error(msg);
  }

  onProgress?.(100);
  return { storagePath };
}

async function uploadWeb(
  localUri: string,
  bucket: string,
  storagePath: string,
  mimeType: string,
  onProgress?: (pct: number) => void,
): Promise<UploadResult> {
  const response = await fetch(localUri);
  const blob = await response.blob();
  const { error } = await supabase.storage
    .from(bucket)
    .upload(storagePath, blob, { contentType: mimeType, upsert: true });
  if (error) {
    let msg = 'Upload failed. Please check your connection and try again.';
    if (error.message?.includes('exceeded') || error.message?.includes('large')) {
      msg = 'File is too large. Please choose a smaller file.';
    }
    console.warn('[uploadWeb] storage error:', error.message);
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
