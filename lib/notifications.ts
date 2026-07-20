import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { supabase } from './supabase';
import { logDebugEvent } from './debugLog';

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
  | 'dice_completed'
  | 'send_love'
  | 'partner_disconnected';

export interface NotificationData {
  event_type: NotifyEventType;
  couple_id: string;
  target_route?: string;
  item_id?: string;
}

// EAS project ID from app.json — required for getExpoPushTokenAsync in production builds.
const EAS_PROJECT_ID = 'cfde070c-187f-4d7e-b643-a20446ff95ab';

/**
 * Request push permission and return the Expo push token string,
 * or null if permission is denied or we're on web.
 *
 * Always call this on app load (not gated on push_notifications_enabled).
 * The OS only shows the permission prompt once; subsequent calls return the
 * cached token immediately. The EAS projectId is required in production —
 * without it getExpoPushTokenAsync silently fails in TestFlight/release builds.
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
    const token = await Notifications.getExpoPushTokenAsync({ projectId: EAS_PROJECT_ID });
    return token.data;
  } catch {
    return null;
  }
}

/**
 * Save the push token to the user's profile row and mark notifications enabled.
 * Call after registration and on each app open (tokens can rotate).
 */
export async function savePushToken(userId: string, token: string) {
  await Promise.all([
    supabase.from('profiles').update({ push_token: token }).eq('id', userId),
    supabase
      .from('user_settings')
      .update({ push_notifications_enabled: true, updated_at: new Date().toISOString() })
      .eq('user_id', userId),
  ]);
}

/**
 * Clear the push token and mark notifications disabled.
 * Call on sign-out or when the user disables notifications.
 */
export async function clearPushToken(userId: string) {
  await Promise.all([
    supabase.from('profiles').update({ push_token: null }).eq('id', userId),
    supabase
      .from('user_settings')
      .update({ push_notifications_enabled: false, updated_at: new Date().toISOString() })
      .eq('user_id', userId),
  ]);
}

export async function notifyPartner(payload: {
  event_type: NotifyEventType;
  couple_id: string;
  target_route?: string;
  item_id?: string;
  partnerUserId?: string | null;
  emoji?: string;
  message_text?: string;
}) {
  // No partner connected yet — nothing to notify
  if ('partnerUserId' in payload && !payload.partnerUserId) return;

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const baseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
    if (!baseUrl.startsWith('https://')) return;
    const anonKey = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();
    const url = `${baseUrl}/functions/v1/notify-partner`;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
          Apikey: anonKey,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      logDebugEvent('PUSH_SEND_RESULT', {
        event_type: payload.event_type,
        http_status: res.status,
        expo_status: data?.expo_status ?? null,
        ticket_id: data?.ticket_id ?? null,
        skipped: data?.skipped ?? null,
        error: data?.error ?? null,
      });
    } catch (fetchErr: any) {
      logDebugEvent('PUSH_SEND_ERROR', {
        event_type: payload.event_type,
        message: fetchErr?.message ?? String(fetchErr),
      });
    }
  } catch {
    // Never throw — notifications are best-effort
  }
}
