import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { supabase } from './supabase';
import { logDebugEvent } from './debugLog';

export type NotifyEventType =
  | 'new_message'
  | 'new_photo'
  | 'new_video'
  | 'new_vault_item'
  | 'new_dare'
  | 'dare_accepted'
  | 'dare_rejected'
  | 'dare_completed'
  | 'new_ask'
  | 'ask_answered'
  | 'new_wish'
  | 'wish_bumped'
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

const EAS_PROJECT_ID = 'cfde070c-187f-4d7e-b643-a20446ff95ab';
const ANDROID_NOTIFICATION_CHANNEL_ID = 'warm-me-up';

export async function ensureAndroidNotificationChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync(ANDROID_NOTIFICATION_CHANNEL_ID, {
      name: 'Warm Me Up',
      description: 'Private notifications from your partner',
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 250],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
      sound: 'default',
      enableVibrate: true,
      showBadge: true,
    });
  } catch (e: any) {
    logDebugEvent('ANDROID_NOTIFICATION_CHANNEL_ERROR', { message: e?.message ?? String(e) });
  }
}

export async function registerForPushNotifications(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  await ensureAndroidNotificationChannel();
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
  } catch { return null; }
}

export async function savePushToken(userId: string, token: string) {
  await Promise.all([
    supabase.from('profiles').update({ push_token: token }).eq('id', userId),
    supabase.from('user_settings').update({ push_notifications_enabled: true, updated_at: new Date().toISOString() }).eq('user_id', userId),
  ]);
}

export async function clearPushToken(userId: string) {
  await Promise.all([
    supabase.from('profiles').update({ push_token: null }).eq('id', userId),
    supabase.from('user_settings').update({ push_notifications_enabled: false, updated_at: new Date().toISOString() }).eq('user_id', userId),
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
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}`, Apikey: anonKey },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      logDebugEvent('PUSH_SEND_RESULT', { event_type: payload.event_type, http_status: res.status, expo_status: data?.expo_status ?? null, ticket_id: data?.ticket_id ?? null, skipped: data?.skipped ?? null, error: data?.error ?? null });
    } catch (fetchErr: any) {
      logDebugEvent('PUSH_SEND_ERROR', { event_type: payload.event_type, message: fetchErr?.message ?? String(fetchErr) });
    }
  } catch { /* notifications are best-effort */ }
}
