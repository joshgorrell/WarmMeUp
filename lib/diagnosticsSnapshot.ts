import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { logger } from '@/lib/logger';

const STORAGE_KEY = 'debug_diagnostics_snapshot';

export interface DiagnosticsSnapshot {
  userId: string;
  email: string | null;
  authStatus: string;
  pushTokenStatus: string;
  currentRoute: string;
  savedAt: string;
}

/**
 * Save a non-sensitive diagnostics snapshot to secure storage.
 * The debug screen reads this to show the last known state.
 */
export async function saveDiagnosticsSnapshot(
  userId: string,
  email: string | null,
  data: {
    authStatus: string;
    pushTokenStatus: string;
    currentRoute: string;
  },
): Promise<void> {
  const snapshot: DiagnosticsSnapshot = {
    userId,
    email,
    authStatus: data.authStatus,
    pushTokenStatus: data.pushTokenStatus,
    currentRoute: data.currentRoute,
    savedAt: new Date().toISOString(),
  };

  try {
    if (Platform.OS !== 'web') {
      await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(snapshot));
    } else if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    }
  } catch (e: any) {
    logger.warn('[diagnostics] saveSnapshot failed:', e?.message);
  }
}

/**
 * Load the last saved diagnostics snapshot.
 */
export async function loadDiagnosticsSnapshot(): Promise<DiagnosticsSnapshot | null> {
  try {
    let raw: string | null = null;
    if (Platform.OS !== 'web') {
      raw = await SecureStore.getItemAsync(STORAGE_KEY);
    } else if (typeof window !== 'undefined' && window.sessionStorage) {
      raw = window.sessionStorage.getItem(STORAGE_KEY);
    }
    if (!raw) return null;
    return JSON.parse(raw) as DiagnosticsSnapshot;
  } catch {
    return null;
  }
}
