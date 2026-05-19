import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { supabase } from './supabase';

export type NotifyEventType =
  | 'new_message'
  | 'new_vault_item'
  | 'new_dare'
  | 'dare_accepted'
  | 'dare_rejected'
  | 'dare_completed'
  | 'new_ask'
  | 'ask_answered'
  | 'new_wish'
  | 'wish_fulfilled'
  | 'dice_roll'
  | 'dice_accepted'
  | 'dice_completed';

export interface NotificationData {
  event_type: NotifyEventType;
  couple_id: string;
  target_route?: string;
  item_id?: string;
}

/**
 * Request push permission and return the Expo push token string,
 * or null if permission is denied or we're on web.
 */
export async function registerForPushNotifications(): Promise<string | null> {
  if (Platform.OS === 'web') return null;

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;

  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') return null;

  try {
    const token = await Notifications.getExpoPushTokenAsync();
    return token.data;
  } catch {
    return null;
  }
}

/**
 * Save the push token to the user's profile row.
 * Call after registration and on each app open (tokens can rotate).
 */
export async function savePushToken(userId: string, token: string) {
  await supabase.from('profiles').update({ push_token: token }).eq('id', userId);
}

/**
 * Clear the push token from the profile (on sign-out or notifications disabled).
 */
export async function clearPushToken(userId: string) {
  await supabase.from('profiles').update({ push_token: null }).eq('id', userId);
}

/**
 * Fire-and-forget: call the notify-partner Edge Function.
 * Silently swallows errors — never block the UI on this.
 */
export async function notifyPartner(payload: {
  event_type: NotifyEventType;
  couple_id: string;
  target_route?: string;
  item_id?: string;
}) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const baseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
    if (!baseUrl.startsWith('https://')) return;
    const url = `${baseUrl}/functions/v1/notify-partner`;
    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
        Apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
      },
      body: JSON.stringify(payload),
    }).catch(() => {});
  } catch {
    // Never throw — notifications are best-effort
  }
}
