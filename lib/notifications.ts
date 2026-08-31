import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';

/**
 * Request push notification permission and return the Expo push token.
 * Returns null if permission is denied or the platform is web.
 */
export async function registerForPushNotifications(): Promise<string | null> {
  if (Platform.OS === 'web') return null;

  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') return null;

    const token = (await Notifications.getExpoPushTokenAsync()).data;
    return token ?? null;
  } catch (e: any) {
    logger.warn('[notifications] registerForPush failed:', e?.message);
    return null;
  }
}

/**
 * Save the push token to the user's profile in the database.
 */
export async function savePushToken(userId: string, token: string): Promise<void> {
  try {
    await supabase
      .from('profiles')
      .update({ push_token: token })
      .eq('id', userId);
  } catch (e: any) {
    logger.warn('[notifications] savePushToken failed:', e?.message);
  }
}

/**
 * Clear the push token from the user's profile (on sign-out).
 */
export async function clearPushToken(userId: string): Promise<void> {
  try {
    await supabase
      .from('profiles')
      .update({ push_token: null })
      .eq('id', userId);
  } catch (e: any) {
    logger.warn('[notifications] clearPushToken failed:', e?.message);
  }
}
