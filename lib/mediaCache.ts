import { Platform } from 'react-native';

/**
 * Clear expo-image's managed caches after deletion and session changes.
 * This is app-level cleanup, not a guarantee of forensic erasure or remote-device cleanup.
 *
 * On web this is a no-op — the browser manages its own image cache and it is
 * not safe to clear it from JS.
 */
export async function clearLocalImageCache(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const { Image } = await import('expo-image');
    await Promise.all([
      Image.clearMemoryCache(),
      Image.clearDiskCache(),
    ]);
  } catch {
    // expo-image may not be available in all environments — fail silently.
  }
}

/**
 * Delete a local temp file created during upload (compressed image copy or
 * video thumbnail). Only deletes files inside the app's own sandboxed cache
 * directory. Skips ph:// and content:// URIs (references into the shared
 * photo library) so the user's camera roll is never touched.
 */
export async function cleanupTempFile(uri: string): Promise<void> {
  if (Platform.OS === 'web') return;
  // Never touch shared-photo-library references — they are read-only handles
  // into the OS picker, not files the app owns.
  if (uri.startsWith('ph://') || uri.startsWith('content://')) return;
  if (!uri.startsWith('file://')) return;
  try {
    const FileSystem = await import('expo-file-system/legacy');
    const cacheRoot = FileSystem.cacheDirectory;
    if (!cacheRoot || !uri.startsWith(cacheRoot) || /(?:^|\/)\.\.(?:\/|$)|%2e|%2f/i.test(uri)) return;
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists) {
      await FileSystem.deleteAsync(uri, { idempotent: true });
    }
  } catch {
    // Best-effort — temp file cleanup must never block or break the upload flow.
  }
}
