import { Platform } from 'react-native';

/**
 * Generate a namespaced secure storage key that includes the user ID,
 * so different users' data doesn't collide on shared devices.
 */
export function secureKey(base: string, userId: string): string {
  return `${base}_${userId}`;
}
