import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const STORAGE_KEY = 'warmup_pending_invite_code';

/**
 * Persist an invite code to secure storage so it survives app restarts
 * and OAuth redirect round-trips.
 */
export async function savePendingCode(code: string): Promise<void> {
  const normalized = code.toUpperCase().trim();
  if (!normalized) return;
  try {
    if (Platform.OS !== 'web') {
      await SecureStore.setItemAsync(STORAGE_KEY, normalized);
    } else if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.setItem(STORAGE_KEY, normalized);
    }
  } catch {
    // best effort
  }
}

/**
 * Load a previously saved pending invite code.
 */
export async function loadPendingCode(): Promise<string | null> {
  try {
    if (Platform.OS !== 'web') {
      return await SecureStore.getItemAsync(STORAGE_KEY);
    }
    if (typeof window !== 'undefined' && window.sessionStorage) {
      return window.sessionStorage.getItem(STORAGE_KEY);
    }
  } catch {
    // best effort
  }
  return null;
}

/**
 * Remove the stored pending invite code (after successful join or cancellation).
 */
export async function clearPendingCode(): Promise<void> {
  try {
    if (Platform.OS !== 'web') {
      await SecureStore.deleteItemAsync(STORAGE_KEY);
    } else if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // best effort
  }
}

/**
 * Uppercase, trim, and strip any non-alphanumeric characters from a code input.
 */
export function sanitizeInviteCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 6);
}

/**
 * Validate that a code is exactly 6 alphanumeric characters.
 */
export function validateCodeFormat(code: string): boolean {
  return /^[A-Z0-9]{6}$/.test(code);
}
