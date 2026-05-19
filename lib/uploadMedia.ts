import { Platform } from 'react-native';
import * as LegacyFileSystem from 'expo-file-system/legacy';
import { supabase } from './supabase';

export type UploadResult = {
  storagePath: string;
};

/**
 * Reliably uploads a local file URI to Supabase Storage with real upload-progress
 * reporting. Uses expo-file-system to read the file (avoids the unreliable
 * fetch→blob pattern on React Native) and XHR directly against the Supabase
 * Storage REST API so we can fire onprogress events.
 *
 * On web, falls back to the standard supabase-js upload (fetch-based) because
 * expo-file-system is not available and local URIs from the web picker are
 * object-URL blobs that fetch() handles correctly.
 */
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
  // Get a fresh session token
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
  const uploadUrl = `${supabaseUrl}/storage/v1/object/${bucket}/${storagePath}`;

  // Read file as base64 using expo-file-system — works reliably for all local
  // URIs including PHAsset-backed file:// paths on iOS and content:// on Android.
  const base64 = await LegacyFileSystem.readAsStringAsync(localUri, {
    encoding: 'base64',
  });

  // Decode base64 → binary string → Uint8Array
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }

  return new Promise<UploadResult>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', uploadUrl);
    xhr.setRequestHeader('Authorization', `Bearer ${session.access_token}`);
    xhr.setRequestHeader('Content-Type', mimeType);
    xhr.setRequestHeader('x-upsert', 'false');
    // Required by Supabase storage
    xhr.setRequestHeader('apikey', process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!);

    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100);
        resolve({ storagePath });
      } else {
        let msg = `Upload failed (${xhr.status})`;
        try {
          const body = JSON.parse(xhr.responseText);
          if (body?.error || body?.message) msg = body.error ?? body.message;
        } catch {}
        reject(new Error(msg));
      }
    };

    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.ontimeout = () => reject(new Error('Upload timed out'));

    xhr.send(bytes.buffer);
  });
}

async function uploadWeb(
  localUri: string,
  bucket: string,
  storagePath: string,
  mimeType: string,
  onProgress?: (pct: number) => void,
): Promise<UploadResult> {
  // On web, localUri is an object URL — fetch it as a blob and use supabase-js
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
  // Ask iOS to export as a copy so we always get a writable file:// URI rather
  // than a PHAsset reference, which is what causes silent failures on iOS 14+.
  exportsVideoAsCopy: true,
};
