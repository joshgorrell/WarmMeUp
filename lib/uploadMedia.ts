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
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
  const uploadUrl = `${supabaseUrl}/storage/v1/object/${bucket}/${storagePath}`;

  // Supabase Storage REST API requires PUT for object uploads.
  // POST is only for multipart uploads and returns 4xx on standard requests.
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
 * Resolve the correct MIME type from an expo-image-picker asset.
 * iOS often reports image/heic but transcodes to JPEG when quality < 1,
 * so we normalise HEIC/HEIF → image/jpeg to match the bucket allow-list.
 */
export function resolveAssetMimeType(asset: { mimeType?: string | null; type?: string }): string {
  const raw = asset.mimeType?.toLowerCase() ?? '';
  if (raw === 'image/heic' || raw === 'image/heif' || raw === 'image/heif-sequence') {
    return 'image/jpeg';
  }
  if (raw) return raw;
  return asset.type === 'video' ? 'video/mp4' : 'image/jpeg';
}
