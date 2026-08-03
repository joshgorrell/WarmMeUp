import { Platform } from 'react-native';

/**
 * Set the iOS home-screen app-icon badge to the given count.
 * On Android and web this is a no-op (Android has no app-icon badge API).
 * Pass 0 to clear the badge.
 */
export async function setAppBadge(count: number): Promise<void> {
  if (Platform.OS !== 'ios') return;
  try {
    const Notifications = await import('expo-notifications');
    await Notifications.setBadgeCountAsync(Math.max(0, Math.floor(count)));
  } catch {
    // Best-effort — never throw on badge updates
  }
}

/**
 * Clear the iOS home-screen app-icon badge (set it to 0).
 */
export async function clearAppBadge(): Promise<void> {
  await setAppBadge(0);
}
