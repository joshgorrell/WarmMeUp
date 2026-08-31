import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { supabase } from '@/lib/supabase';
import { getDebugEvents } from '@/lib/debugLog';
import type { SubscriptionInfo } from '@/lib/types';

export interface DiagnosticsSnapshot {
  app_version: string;
  build_number: string;
  ota_update_id: string;
  runtime_version: string;
  channel: string;
  update_source: string;
  platform: string;
  os_version: string;
  network_supabase_reachable: string;
  auth_status: string;
  last_auth_error: string;
  last_signup_error: string;
  push_token_status: string;
  subscription_status: string;
  subscription_source: string;
  current_route: string;
  app_events: string[];
  captured_at: string;
}

export interface SnapshotOptions {
  authStatus?: string;
  lastAuthError?: string;
  lastSignupError?: string;
  pushTokenStatus?: string;
  subscriptionInfo?: SubscriptionInfo | null;
  currentRoute?: string;
}

async function probeSupabaseReachable(): Promise<string> {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
  if (!url) return 'url not configured';
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(url, { method: 'HEAD', signal: controller.signal });
    clearTimeout(timer);
    return `reachable — HTTP ${res.status}`;
  } catch (e: any) {
    return `unreachable — ${e?.message ?? 'error'}`;
  }
}

function getLastAuthErrorFromSecureStore(): Promise<string> {
  if (Platform.OS === 'web') return Promise.resolve('');
  return SecureStore.getItemAsync('debug_auth_error_message')
    .then(v => v ?? '')
    .catch(() => '');
}

export async function captureDiagnosticsSnapshot(
  opts: SnapshotOptions = {},
): Promise<DiagnosticsSnapshot> {
  const [networkResult, storedAuthError] = await Promise.all([
    probeSupabaseReachable(),
    getLastAuthErrorFromSecureStore(),
  ]);

  const events = getDebugEvents()
    .slice(0, 20)
    .map(e => `[${e.timestamp.slice(11, 19)}] ${e.tag}`);

  const sub = opts.subscriptionInfo;
  const subscriptionStatus = sub
    ? (sub.isPremium ? `premium — ${sub.plan ?? 'active'}` : sub.isOnTrial ? 'trial' : 'free')
    : 'unknown';

  return {
    app_version: Constants.expoConfig?.version ?? 'unknown',
    build_number: String(
      Constants.expoConfig?.ios?.buildNumber ??
      Constants.expoConfig?.android?.versionCode ??
      'unknown',
    ),
    ota_update_id: Updates.updateId ?? 'n/a (embedded)',
    runtime_version: Updates.runtimeVersion ?? 'unknown',
    channel: Updates.channel ?? 'unknown',
    update_source: Updates.isEmbeddedLaunch ? 'embedded' : 'OTA',
    platform: Platform.OS,
    os_version: String(Platform.Version ?? 'unknown'),
    network_supabase_reachable: networkResult,
    auth_status: opts.authStatus ?? 'unknown',
    last_auth_error: opts.lastAuthError ?? storedAuthError,
    last_signup_error: opts.lastSignupError ?? '',
    push_token_status: opts.pushTokenStatus ?? 'unknown',
    subscription_status: subscriptionStatus,
    subscription_source: sub?.source ?? 'unknown',
    current_route: opts.currentRoute ?? 'unknown',
    app_events: events,
    captured_at: new Date().toISOString(),
  };
}

export async function saveDiagnosticsSnapshot(
  userId: string,
  email: string | null | undefined,
  opts: SnapshotOptions = {},
): Promise<void> {
  try {
    const snapshot = await captureDiagnosticsSnapshot(opts);
    await supabase.from('user_diagnostics').upsert(
      { user_id: userId, email: email ?? null, snapshot, captured_at: snapshot.captured_at },
      { onConflict: 'user_id' },
    );
  } catch {
    // diagnostics saves are best-effort; never throw
  }
}

export function buildDiagnosticsReport(
  snapshot: DiagnosticsSnapshot,
  displayName?: string | null,
  email?: string | null,
): string {
  const lines: string[] = [
    '=== Warm Me Up — Diagnostics Report ===',
    `Captured:        ${snapshot.captured_at}`,
    '',
  ];
  if (displayName) lines.push(`User:            ${displayName}`);
  if (email) lines.push(`Email:           ${email}`);
  lines.push(
    '',
    '--- App ---',
    `Version:         ${snapshot.app_version}`,
    `Build:           ${snapshot.build_number}`,
    `OTA update ID:   ${snapshot.ota_update_id}`,
    `Runtime version: ${snapshot.runtime_version}`,
    `Channel:         ${snapshot.channel}`,
    `Update source:   ${snapshot.update_source}`,
    '',
    '--- Device ---',
    `Platform:        ${snapshot.platform}`,
    `OS version:      ${snapshot.os_version}`,
    '',
    '--- Network ---',
    `Supabase:        ${snapshot.network_supabase_reachable}`,
    '',
    '--- Auth ---',
    `Auth status:     ${snapshot.auth_status}`,
    `Last auth error: ${snapshot.last_auth_error || '(none)'}`,
    `Last signup err: ${snapshot.last_signup_error || '(none)'}`,
    '',
    '--- Push / Subscription ---',
    `Push token:      ${snapshot.push_token_status}`,
    `Subscription:    ${snapshot.subscription_status}`,
    `Sub source:      ${snapshot.subscription_source}`,
    '',
    '--- Navigation ---',
    `Current route:   ${snapshot.current_route}`,
    '',
    '--- Recent App Events (last 20) ---',
  );
  if (snapshot.app_events.length > 0) {
    snapshot.app_events.forEach(e => lines.push(e));
  } else {
    lines.push('(none)');
  }
  lines.push('', '=== end ===');
  return lines.join('\n');
}
