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

  const result = await FileSystem.uploadAsync(uploadUrl, localUri, {
    httpMethod: 'POST',
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
      'Content-Type': mimeType,
      'x-upsert': 'false',
    },
    sessionType: FileSystem.FileSystemSessionType.BACKGROUND,
    mimeType,
  });

  if (result.status < 200 || result.status >= 300) {
    let msg = `Upload failed (${result.status})`;
    try {
      const body = JSON.parse(result.body);
      if (body?.error || body?.message) msg = body.error ?? body.message;
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
    .upload(storagePath, blob, { contentType: mimeType, upsert: false });
  if (error) throw new Error(error.message);
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
