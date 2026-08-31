import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { logger } from '@/lib/logger';

/**
 * Set the app icon badge count (iOS only; no-op on other platforms).
 */
export async function setAppBadge(count: number): Promise<void> {
  if (Platform.OS !== 'ios') return;
  try {
    await Notifications.setBadgeCountAsync(count);
  } catch (e: any) {
    logger.warn('[appBadge] setAppBadge failed:', e?.message);
  }
}

/**
 * Clear the app icon badge (set to 0).
 */
export async function clearAppBadge(): Promise<void> {
  await setAppBadge(0);
}
