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
