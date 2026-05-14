import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

/**
 * expo-secure-store only allows alphanumeric characters and underscores in keys.
 * Supabase user IDs are UUIDs (contain hyphens), so we sanitize them here.
 */
export function secureKey(base: string, userId: string): string {
  const safe = userId.replace(/-/g, '_');
  return `${base}_${safe}`;
}

/**
 * Returns true if a PIN has been stored for the given user on this device/browser.
 * Used to decide whether to route to setup-pin or to the unlock screen.
 */
export async function hasPinStored(userId: string): Promise<boolean> {
  try {
    const key = secureKey('warmup_pin', userId);
    if (Platform.OS !== 'web') {
      const val = await SecureStore.getItemAsync(key);
      return !!val;
    } else if (typeof window !== 'undefined') {
      const val = window.localStorage.getItem(key);
      return !!val;
    }
    return false;
  } catch {
    return false;
  }
}
