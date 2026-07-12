import React, { useEffect, useState, useCallback } from 'react';
import {
  View, ScrollView, StyleSheet, TouchableOpacity, Alert, Platform, Share, ActivityIndicator,
} from 'react-native';
import * as Updates from 'expo-updates';
import * as Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import * as Notifications from 'expo-notifications';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, usePathname, useFocusEffect } from 'expo-router';
import { ChevronLeft, Trash2, LogOut, Shield, Share2, RefreshCw } from 'lucide-react-native';
import AppText from '@/components/AppText';
import { useAuth, computeIsUnlockRequired, computeShouldShowPrivacyCover } from '@/context/AuthContext';
import { supabase, getSupabaseDiagnostics } from '@/lib/supabase';
import { secureKey, hasPinStored } from '@/lib/secureKey';
import { clearWeatherSessionCache } from '@/hooks/useWeather';
import { getDebugEvents, clearDebugEvents, subscribeDebugEvents, logDebugEvent, DebugEvent } from '@/lib/debugLog';
import { APP_CODE_VERSION, OTA_MARKER, GIT_SHA } from '@/lib/appVersion';
import { registerForPushNotifications, savePushToken } from '@/lib/notifications';
import { Spacing, Radius, FontSize } from '@/constants/theme';

function Row({ label, value }: { label: string; value: string | number | boolean | null | undefined }) {
  const display =
    value === null || value === undefined
      ? 'null'
      : value === true
      ? 'true'
      : value === false
      ? 'false'
      : String(value);

  const isNull = value === null || value === undefined;
  const isBad = value === false || value === 'null';

  return (
    <View style={styles.row}>
      <AppText style={styles.label}>{label}</AppText>
      <AppText
        style={[
          styles.value,
          isNull && styles.valueNull,
          isBad && !isNull && styles.valueBad,
        ]}
        numberOfLines={2}
        selectable
      >
        {display}
      </AppText>
    </View>
  );
}

function Section({ title }: { title: string }) {
  return (
    <View style={styles.sectionHeader}>
      <AppText style={styles.sectionTitle}>{title}</AppText>
    </View>
  );
}

function EventRow({ event }: { event: DebugEvent }) {
  const time = event.timestamp.substring(11, 19);
  const isError = event.tag.includes('ERROR');
  const isSuccess = event.tag.includes('SUCCESS');
  const tagColor = isError ? '#FF6B6B' : isSuccess ? '#4CAF50' : '#FFA040';
  const pairs = Object.entries(event.data)
    .map(([k, v]) => `${k}=${v === null ? 'null' : String(v)}`)
    .join('  ');
  return (
    <View style={styles.eventRow}>
      <AppText style={styles.eventTime}>{time}</AppText>
      <View style={styles.eventBody}>
        <AppText style={[styles.eventTag, { color: tagColor }]}>[{event.tag}]</AppText>
        {!!pairs && (
          <AppText style={styles.eventPairs} selectable numberOfLines={4}>{pairs}</AppText>
        )}
      </View>
    </View>
  );
}

export default function DebugScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { session, user, profile, settings, couple, subscriptionInfo, unlockedAtMs, loading, signOut, refreshSettings, isSuperAdmin } = useAuth();
  const [clearing, setClearing] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [hasPin, setHasPin] = useState<boolean | null>(null);
  const [inactiveCoupleCount, setInactiveCoupleCount] = useState<number | null>(null);
  const [events, setEvents] = useState<DebugEvent[]>(() => getDebugEvents());
  const [rpcTest, setRpcTest] = useState<{
    status: 'idle' | 'loading' | 'success' | 'error' | 'timeout';
    ranAt: string | null;
    result: any | null;
    error: { code: string | null; message: string | null; details: string | null; hint: string | null } | null;
  }>({ status: 'idle', ranAt: null, result: null, error: null });
  const [dbIdentity, setDbIdentity] = useState<{
    status: 'idle' | 'loading' | 'success' | 'error';
    ranAt: string | null;
    result: any | null;
    error: { code: string | null; message: string | null; details: string | null; hint: string | null } | null;
  }>({ status: 'idle', ranAt: null, result: null, error: null });
  const [checkUpdate, setCheckUpdate] = useState<{
    status: 'idle' | 'loading' | 'success' | 'error';
    ranAt: string | null;
    isAvailable: boolean | null;
    manifest: string | null;
    error: string | null;
  }>({ status: 'idle', ranAt: null, isAvailable: null, manifest: null, error: null });
  const [applyUpdate, setApplyUpdate] = useState<{
    status: 'idle' | 'checking' | 'no-update' | 'fetching' | 'reloading' | 'error';
    ranAt: string | null;
    error: string | null;
  }>({ status: 'idle', ranAt: null, error: null });
  const [sessionTest, setSessionTest] = useState<{
    status: 'idle' | 'loading' | 'success' | 'error';
    ranAt: string | null;
    result: string | null;
    error: string | null;
  }>({ status: 'idle', ranAt: null, result: null, error: null });
  const [dbTest, setDbTest] = useState<{
    status: 'idle' | 'loading' | 'success' | 'error';
    ranAt: string | null;
    result: string | null;
    error: string | null;
  }>({ status: 'idle', ranAt: null, result: null, error: null });
  const [authLastError, setAuthLastError] = useState<string | null>(null);
  const [lastLoginAttempt, setLastLoginAttempt] = useState<string | null>(null);
  const [authProbe, setAuthProbe] = useState<{
    ranAt: string | null;
    // storage adapter
    auth_storage_adapter: string | null;
    // raw storage key inspection
    auth_storage_keys_found: string | null;
    auth_storage_session_key_exists: boolean | null;
    auth_storage_session_raw_length: number | null;
    auth_storage_session_parse_ok: boolean | null;
    auth_storage_session_user_id: string | null;
    auth_storage_session_expires_at: string | null;
    // getSession
    auth_getSession_ran_at: string | null;
    auth_getSession_has_session: boolean | null;
    auth_getSession_user_id: string | null;
    auth_getSession_error_message: string | null;
    // getUser
    auth_getUser_ran_at: string | null;
    auth_getUser_has_user: boolean | null;
    auth_getUser_user_id: string | null;
    auth_getUser_error_message: string | null;
    // auth state events
    last_auth_event: string | null;
    last_auth_event_at: string | null;
    // legacy / compat
    auth_client_source: string;
    // persisted per-key values written by login.tsx
    persisted_error_message: string | null;
    persisted_error_status: string | null;
    persisted_error_code: string | null;
    persisted_error_full_json: string | null;
    persisted_attempt_at: string | null;
    // signin-success fields written immediately after signInWithPassword succeeds
    auth_last_signin_success: string | null;
    auth_last_signin_user_id: string | null;
    auth_last_signin_session_present: string | null;
    auth_last_signin_access_token_present: string | null;
    auth_last_signin_refresh_token_present: string | null;
    // post-signin getSession check
    auth_after_signin_getSession_has_session: string | null;
    auth_after_signin_getSession_user_id: string | null;
    // post-signin raw SecureStore inspection
    auth_after_signin_storage_keys_found: string | null;
    auth_after_signin_session_key_exists: string | null;
    auth_after_signin_session_raw_length: string | null;
    auth_after_signin_session_parse_ok: string | null;
    // kept for backwards compat (old keys still written on older builds)
    auth_session_saved_after_signin: string | null;
    auth_storage_key_after_signin_exists: string | null;
    // session-cleared fields written by AuthContext INITIAL_SESSION validation
    auth_session_cleared_at: string | null;
    auth_session_cleared_reason: string | null;
    // preflight / button-press fields written by login.tsx and unlock.tsx
    login_button_pressed_at: string | null;
    login_handler_file: string | null;
    login_handler_name: string | null;
    login_reached_preflight: string | null;
    login_reached_signInWithPassword: string | null;
    login_preflight_has_supabase_client: string | null;
    login_preflight_has_anon_key: string | null;
    login_preflight_anon_key_length: string | null;
    login_error_source: string | null;
    login_visible_error_message: string | null;
    login_error_full_json: string | null;
    login_error_name: string | null;
    login_error_message: string | null;
    login_error_status: string | null;
    login_error_code: string | null;
    login_error_stack: string | null;
    // network probes
    network_supabase_root_ok: string | null;
    network_supabase_root_status: string | null;
    network_supabase_auth_health_ok: string | null;
    network_supabase_auth_health_status: string | null;
    network_supabase_auth_health_error: string | null;
    // Probe 3: health WITH apikey header — if 200, RN fetch delivers headers; if 401, it strips them
    network_raw_fetch_with_key_ok: string | null;
    network_raw_fetch_with_key_status: string | null;
    network_raw_fetch_with_key_error: string | null;
    // Probe 4: token endpoint WITH apikey — 400=headers arrive, 401=headers stripped
    network_raw_auth_with_key_ok: string | null;
    network_raw_auth_with_key_status: string | null;
    network_raw_auth_with_key_error: string | null;
    // V37: Request-object probe — headers inspected from req.headers.entries() then fetch(req)
    v37_req_headers_entries: string | null;
    v37_req_fetch_status: string | null;
    v37_req_fetch_ok: string | null;
    v37_req_fetch_body: string | null;
    // V38: auto-run on debug load — Request obj + URL-param fallback
    v38_ran_at: string | null;
    v38_req_headers_entries: string | null;
    v38_req_has_apikey: string | null;
    v38_req_has_authorization: string | null;
    v38_req_fetch_status: string | null;
    v38_req_fetch_body: string | null;
    v38_url_param_fetch_status: string | null;
    v38_url_param_fetch_body: string | null;
  }>({
    ranAt: null,
    auth_storage_adapter: null,
    auth_storage_keys_found: null,
    auth_storage_session_key_exists: null,
    auth_storage_session_raw_length: null,
    auth_storage_session_parse_ok: null,
    auth_storage_session_user_id: null,
    auth_storage_session_expires_at: null,
    auth_getSession_ran_at: null,
    auth_getSession_has_session: null,
    auth_getSession_user_id: null,
    auth_getSession_error_message: null,
    auth_getUser_ran_at: null,
    auth_getUser_has_user: null,
    auth_getUser_user_id: null,
    auth_getUser_error_message: null,
    last_auth_event: null,
    last_auth_event_at: null,
    auth_client_source: 'supabase (shared lib/supabase.ts)',
    persisted_error_message: null,
    persisted_error_status: null,
    persisted_error_code: null,
    persisted_error_full_json: null,
    persisted_attempt_at: null,
    auth_last_signin_success: null,
    auth_last_signin_user_id: null,
    auth_last_signin_session_present: null,
    auth_last_signin_access_token_present: null,
    auth_last_signin_refresh_token_present: null,
    auth_after_signin_getSession_has_session: null,
    auth_after_signin_getSession_user_id: null,
    auth_after_signin_storage_keys_found: null,
    auth_after_signin_session_key_exists: null,
    auth_after_signin_session_raw_length: null,
    auth_after_signin_session_parse_ok: null,
    auth_session_saved_after_signin: null,
    auth_storage_key_after_signin_exists: null,
    auth_session_cleared_at: null,
    auth_session_cleared_reason: null,
    login_button_pressed_at: null,
    login_handler_file: null,
    login_handler_name: null,
    login_reached_preflight: null,
    login_reached_signInWithPassword: null,
    login_preflight_has_supabase_client: null,
    login_preflight_has_anon_key: null,
    login_preflight_anon_key_length: null,
    login_error_source: null,
    login_visible_error_message: null,
    login_error_full_json: null,
    login_error_name: null,
    login_error_message: null,
    login_error_status: null,
    login_error_code: null,
    login_error_stack: null,
    network_supabase_root_ok: null,
    network_supabase_root_status: null,
    network_supabase_auth_health_ok: null,
    network_supabase_auth_health_status: null,
    network_supabase_auth_health_error: null,
    network_raw_fetch_with_key_ok: null,
    network_raw_fetch_with_key_status: null,
    network_raw_fetch_with_key_error: null,
    network_raw_auth_with_key_ok: null,
    network_raw_auth_with_key_status: null,
    network_raw_auth_with_key_error: null,
    v37_req_headers_entries: null,
    v37_req_fetch_status: null,
    v37_req_fetch_ok: null,
    v37_req_fetch_body: null,
    v38_ran_at: null,
    v38_req_headers_entries: null,
    v38_req_has_apikey: null,
    v38_req_has_authorization: null,
    v38_req_fetch_status: null,
    v38_req_fetch_body: null,
    v38_url_param_fetch_status: null,
    v38_url_param_fetch_body: null,
  });

  const [lastAuthEvent, setLastAuthEvent] = useState<{ event: string; at: string } | null>(null);
  const [pushDiag, setPushDiag] = useState<{
    ranAt: string | null;
    permission_status: string | null;
    token_present: boolean | null;
    token_prefix: string | null;
    project_id_used: string | null;
    last_registered_at: string | null;
    token_in_db: boolean | null;
    token_matches_device: boolean | null;
    db_notifications_enabled: boolean | null;
  }>({
    ranAt: null,
    permission_status: null,
    token_present: null,
    token_prefix: null,
    project_id_used: null,
    last_registered_at: null,
    token_in_db: null,
    token_matches_device: null,
    db_notifications_enabled: null,
  });

  type PushTestSubResult = {
    status: 'idle' | 'loading' | 'success' | 'error';
    step: string | null;
    send_status: number | null;
    expo_status: string | null;
    skipped_reason: string | null;
    error: string | null;
    expo_ticket_id: string | null;
    expo_payload_sent: string | null;
    receipt_request_started: string | null;
    receipt_request_finished: string | null;
    receipt_timeout: boolean | null;
    receipt_status: string | null;
    receipt_details: string | null;
    receipt_error: string | null;
    receipt_response: string | null;
  };
  const PUSH_TEST_SUB_IDLE: PushTestSubResult = {
    status: 'idle', step: null, send_status: null, expo_status: null, skipped_reason: null, error: null,
    expo_ticket_id: null, expo_payload_sent: null,
    receipt_request_started: null, receipt_request_finished: null,
    receipt_timeout: null, receipt_status: null, receipt_details: null, receipt_error: null, receipt_response: null,
  };
  const [pushTest, setPushTest] = useState<{
    running: boolean;
    step: string | null;
    ranAt: string | null;
    permission_status: string | null;
    token_present: boolean | null;
    token_saved_to_db: boolean | null;
    partner_token_present: boolean | null;
    partner_enabled: boolean | null;
    self: PushTestSubResult;
    partner: PushTestSubResult;
    top_error: string | null;
  }>({
    running: false,
    step: null,
    ranAt: null,
    permission_status: null,
    token_present: null,
    token_saved_to_db: null,
    partner_token_present: null,
    partner_enabled: null,
    self: PUSH_TEST_SUB_IDLE,
    partner: PUSH_TEST_SUB_IDLE,
    top_error: null,
  });

  const [localTestSent, setLocalTestSent] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  const userId = user?.id ?? session?.user?.id ?? null;

  // Derived diagnostics
  const isUnlockRequired = computeIsUnlockRequired(settings, unlockedAtMs);
  const shouldShowPrivacyCover = computeShouldShowPrivacyCover(session, settings);
  const activeCoupleFound = couple?.active === true;
  const sub_canInvite: boolean = Boolean((subscriptionInfo as any).canInvite);
  const alreadyPaired = couple?.user_b_id != null;
  const canRefreshInviteCode = Boolean(userId && sub_canInvite && !alreadyPaired);
  const refreshBlockReason = !userId
    ? 'no_user'
    : alreadyPaired
    ? 'already_paired'
    : !sub_canInvite
    ? 'not_allowed'
    : null;

  useEffect(() => {
    if (userId) {
      hasPinStored(userId).then(setHasPin).catch(() => setHasPin(null));
      // Count inactive couple rows for this user
      supabase
        .from('couples')
        .select('id', { count: 'exact', head: true })
        .or(`user_a_id.eq.${userId},user_b_id.eq.${userId}`)
        .eq('active', false)
        .then(({ count, error }) => {
          if (error) setInactiveCoupleCount(null);
          else setInactiveCoupleCount(count ?? 0);
        });
    }
  }, [userId]);

  // Reload persisted login-attempt and auth-error values every time this screen
  // comes into focus — not just on mount. After a failed login the user is not
  // logged in (userId === null), so a [userId]-dep effect never re-runs if the
  // screen was already mounted; useFocusEffect solves this.
  const runAuthProbe = useCallback(async () => {
    const ranAt = new Date().toISOString();

    // ── 1. Storage adapter ───────────────────────────────────────────────────
    const auth_storage_adapter = Platform.OS === 'web'
      ? 'localStorage (web)'
      : 'expo-secure-store (nativeStorage)';

    // ── 2. Raw storage key inspection ────────────────────────────────────────
    // @supabase/supabase-js v2 stores the session under sb-<projectRef>-auth-token.
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
    const projectRef = supabaseUrl.replace(/^https?:\/\//, '').split('.')[0] ?? '';
    const sessionKey = `sb-${projectRef}-auth-token`;
    const knownKeys = [sessionKey, `${sessionKey}.0`, `${sessionKey}.1`];

    let auth_storage_session_key_exists = false;
    let auth_storage_session_raw_length: number | null = null;
    let auth_storage_session_parse_ok: boolean | null = null;
    let auth_storage_session_user_id: string | null = null;
    let auth_storage_session_expires_at: string | null = null;
    let auth_storage_keys_found = '(none found)';

    try {
      if (Platform.OS !== 'web') {
        // supabase-js v2 may chunk large values across .0 and .1 keys
        const [v0, v1, v2] = await Promise.all(knownKeys.map(k => SecureStore.getItemAsync(k).catch(() => null)));
        const found: string[] = [];
        if (v0 !== null) found.push(sessionKey);
        if (v1 !== null) found.push(`${sessionKey}.0`);
        if (v2 !== null) found.push(`${sessionKey}.1`);
        auth_storage_keys_found = found.length ? found.join(', ') : '(none found)';

        // Try to assemble the raw value: chunked (.0 + .1) or unchunked (v0)
        const raw = (v1 !== null ? (v1 + (v2 ?? '')) : v0) ?? null;
        if (raw !== null) {
          auth_storage_session_key_exists = true;
          auth_storage_session_raw_length = raw.length;
          try {
            const parsed = JSON.parse(raw);
            auth_storage_session_parse_ok = true;
            auth_storage_session_user_id = parsed?.user?.id ?? parsed?.access_token
              ? (() => { try { const p = JSON.parse(atob((parsed.access_token as string).split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))); return p?.sub ?? null; } catch { return null; } })()
              : null;
            const exp = parsed?.expires_at ?? parsed?.user?.exp ?? null;
            auth_storage_session_expires_at = exp ? new Date(exp * 1000).toISOString() : null;
          } catch {
            auth_storage_session_parse_ok = false;
          }
        }
      } else {
        // Web: check localStorage
        try {
          const raw = window.localStorage.getItem(sessionKey);
          if (raw !== null) {
            auth_storage_session_key_exists = true;
            auth_storage_session_raw_length = raw.length;
            auth_storage_keys_found = sessionKey;
            try {
              const parsed = JSON.parse(raw);
              auth_storage_session_parse_ok = true;
              auth_storage_session_user_id = parsed?.user?.id ?? null;
              const exp = parsed?.expires_at ?? null;
              auth_storage_session_expires_at = exp ? new Date(exp * 1000).toISOString() : null;
            } catch {
              auth_storage_session_parse_ok = false;
            }
          }
        } catch {}
      }
    } catch {}

    // ── 3. getSession ────────────────────────────────────────────────────────
    const auth_getSession_ran_at = new Date().toISOString();
    let auth_getSession_has_session: boolean | null = null;
    let auth_getSession_user_id: string | null = null;
    let auth_getSession_error_message: string | null = null;
    try {
      const { data, error: err } = await supabase.auth.getSession();
      if (err) {
        auth_getSession_error_message = `${err.message} (status=${(err as any).status ?? 'n/a'})`;
        auth_getSession_has_session = false;
      } else {
        auth_getSession_has_session = !!data.session;
        auth_getSession_user_id = data.session?.user?.id ?? null;
      }
    } catch (e: any) {
      auth_getSession_error_message = e?.message ?? String(e);
      auth_getSession_has_session = false;
    }

    // ── 4. getUser ───────────────────────────────────────────────────────────
    const auth_getUser_ran_at = new Date().toISOString();
    let auth_getUser_has_user: boolean | null = null;
    let auth_getUser_user_id: string | null = null;
    let auth_getUser_error_message: string | null = null;
    try {
      const { data, error: err } = await supabase.auth.getUser();
      if (err) {
        auth_getUser_error_message = `${err.message} (status=${(err as any).status ?? 'n/a'} code=${(err as any).code ?? 'n/a'})`;
        auth_getUser_has_user = false;
      } else {
        auth_getUser_has_user = !!data.user;
        auth_getUser_user_id = data.user?.id ?? null;
      }
    } catch (e: any) {
      auth_getUser_error_message = e?.message ?? String(e);
      auth_getUser_has_user = false;
    }

    // ── 5. Persisted per-key diagnostics written by login.tsx ────────────────
    const [
      pMsg, pStatus, pCode, pFull, pAt,
      pSigninSuccess, pSigninUid, pSigninSession,
      pAccessToken, pRefreshToken,
      pAfterSessionHas, pAfterSessionUid,
      pAfterStorageKeys, pAfterKeyExists, pAfterRawLen, pAfterParseOk,
      pSessionSaved, pKeyAfterSignin,
      pClearedAt, pClearedReason,
      pLoginPressedAt, pLoginHandlerFile, pLoginHandlerName,
      pLoginReachedPreflight, pLoginReached,
      pLoginHasClient, pLoginHasKey, pLoginKeyLen,
      pLoginErrSource, pLoginVisibleErr, pLoginErrFullJson,
      pLoginErrName, pLoginErrMessage, pLoginErrStatus, pLoginErrCode, pLoginErrStack,
      pNetRootOk, pNetRootStatus,
      pNetAuthOk, pNetAuthStatus, pNetAuthError,
      pNetRawKeyOk, pNetRawKeyStatus, pNetRawKeyError,
      pNetRawAuthOk, pNetRawAuthStatus, pNetRawAuthError,
      pV37ReqHeaders, pV37FetchStatus, pV37FetchOk, pV37FetchBody,
      pV38ReqHeaders, pV38ReqHasApikey, pV38ReqHasAuth,
      pV38FetchStatus, pV38FetchBody,
      pV38UrlStatus, pV38UrlBody,
    ] = await Promise.all([
      SecureStore.getItemAsync('debug_auth_error_message').catch(() => null),
      SecureStore.getItemAsync('debug_auth_error_status').catch(() => null),
      SecureStore.getItemAsync('debug_auth_error_code').catch(() => null),
      SecureStore.getItemAsync('debug_auth_error_full_json').catch(() => null),
      SecureStore.getItemAsync('debug_auth_last_attempt_at').catch(() => null),
      SecureStore.getItemAsync('debug_last_signin_success').catch(() => null),
      SecureStore.getItemAsync('debug_last_signin_user_id').catch(() => null),
      SecureStore.getItemAsync('debug_last_signin_session_present').catch(() => null),
      SecureStore.getItemAsync('debug_last_signin_access_token_present').catch(() => null),
      SecureStore.getItemAsync('debug_last_signin_refresh_token_present').catch(() => null),
      SecureStore.getItemAsync('debug_after_signin_getSession_has_session').catch(() => null),
      SecureStore.getItemAsync('debug_after_signin_getSession_user_id').catch(() => null),
      SecureStore.getItemAsync('debug_after_signin_storage_keys_found').catch(() => null),
      SecureStore.getItemAsync('debug_after_signin_session_key_exists').catch(() => null),
      SecureStore.getItemAsync('debug_after_signin_session_raw_length').catch(() => null),
      SecureStore.getItemAsync('debug_after_signin_session_parse_ok').catch(() => null),
      SecureStore.getItemAsync('debug_session_saved_after_signin').catch(() => null),
      SecureStore.getItemAsync('debug_storage_key_after_signin_exists').catch(() => null),
      SecureStore.getItemAsync('debug_session_cleared_at').catch(() => null),
      SecureStore.getItemAsync('debug_session_cleared_reason').catch(() => null),
      SecureStore.getItemAsync('debug_login_button_pressed_at').catch(() => null),
      SecureStore.getItemAsync('debug_login_handler_file').catch(() => null),
      SecureStore.getItemAsync('debug_login_handler_name').catch(() => null),
      SecureStore.getItemAsync('debug_login_reached_preflight').catch(() => null),
      SecureStore.getItemAsync('debug_login_reached_signInWithPassword').catch(() => null),
      SecureStore.getItemAsync('debug_login_preflight_has_supabase_client').catch(() => null),
      SecureStore.getItemAsync('debug_login_preflight_has_anon_key').catch(() => null),
      SecureStore.getItemAsync('debug_login_preflight_anon_key_length').catch(() => null),
      SecureStore.getItemAsync('debug_login_error_source').catch(() => null),
      SecureStore.getItemAsync('debug_login_visible_error_message').catch(() => null),
      SecureStore.getItemAsync('debug_login_error_full_json').catch(() => null),
      SecureStore.getItemAsync('debug_login_error_name').catch(() => null),
      SecureStore.getItemAsync('debug_login_error_message').catch(() => null),
      SecureStore.getItemAsync('debug_login_error_status').catch(() => null),
      SecureStore.getItemAsync('debug_login_error_code').catch(() => null),
      SecureStore.getItemAsync('debug_login_error_stack').catch(() => null),
      SecureStore.getItemAsync('debug_network_supabase_root_ok').catch(() => null),
      SecureStore.getItemAsync('debug_network_supabase_root_status').catch(() => null),
      SecureStore.getItemAsync('debug_network_supabase_auth_health_ok').catch(() => null),
      SecureStore.getItemAsync('debug_network_supabase_auth_health_status').catch(() => null),
      SecureStore.getItemAsync('debug_network_supabase_auth_health_error').catch(() => null),
      SecureStore.getItemAsync('debug_network_raw_fetch_with_key_ok').catch(() => null),
      SecureStore.getItemAsync('debug_network_raw_fetch_with_key_status').catch(() => null),
      SecureStore.getItemAsync('debug_network_raw_fetch_with_key_error').catch(() => null),
      SecureStore.getItemAsync('debug_network_raw_auth_with_key_ok').catch(() => null),
      SecureStore.getItemAsync('debug_network_raw_auth_with_key_status').catch(() => null),
      SecureStore.getItemAsync('debug_network_raw_auth_with_key_error').catch(() => null),
      SecureStore.getItemAsync('debug_v37_req_headers_entries').catch(() => null),
      SecureStore.getItemAsync('debug_v37_req_fetch_status').catch(() => null),
      SecureStore.getItemAsync('debug_v37_req_fetch_ok').catch(() => null),
      SecureStore.getItemAsync('debug_v37_req_fetch_body').catch(() => null),
      SecureStore.getItemAsync('debug_v38_req_headers_entries').catch(() => null),
      SecureStore.getItemAsync('debug_v38_req_has_apikey').catch(() => null),
      SecureStore.getItemAsync('debug_v38_req_has_authorization').catch(() => null),
      SecureStore.getItemAsync('debug_v38_req_fetch_status').catch(() => null),
      SecureStore.getItemAsync('debug_v38_req_fetch_body').catch(() => null),
      SecureStore.getItemAsync('debug_v38_url_param_fetch_status').catch(() => null),
      SecureStore.getItemAsync('debug_v38_url_param_fetch_body').catch(() => null),
    ]);

    setAuthProbe(prev => ({
      ...prev,
      ranAt,
      auth_storage_adapter,
      auth_storage_keys_found,
      auth_storage_session_key_exists,
      auth_storage_session_raw_length,
      auth_storage_session_parse_ok,
      auth_storage_session_user_id,
      auth_storage_session_expires_at,
      auth_getSession_ran_at,
      auth_getSession_has_session,
      auth_getSession_user_id,
      auth_getSession_error_message,
      auth_getUser_ran_at,
      auth_getUser_has_user,
      auth_getUser_user_id,
      auth_getUser_error_message,
      last_auth_event: prev.last_auth_event,
      last_auth_event_at: prev.last_auth_event_at,
      auth_client_source: 'supabase (shared lib/supabase.ts) — storage: nativeStorage/SecureStore on native, webStorage/localStorage on web',
      persisted_error_message: pMsg,
      persisted_error_status: pStatus,
      persisted_error_code: pCode,
      persisted_error_full_json: pFull,
      persisted_attempt_at: pAt,
      auth_last_signin_success: pSigninSuccess,
      auth_last_signin_user_id: pSigninUid,
      auth_last_signin_session_present: pSigninSession,
      auth_last_signin_access_token_present: pAccessToken,
      auth_last_signin_refresh_token_present: pRefreshToken,
      auth_after_signin_getSession_has_session: pAfterSessionHas,
      auth_after_signin_getSession_user_id: pAfterSessionUid,
      auth_after_signin_storage_keys_found: pAfterStorageKeys,
      auth_after_signin_session_key_exists: pAfterKeyExists,
      auth_after_signin_session_raw_length: pAfterRawLen,
      auth_after_signin_session_parse_ok: pAfterParseOk,
      auth_session_saved_after_signin: pSessionSaved,
      auth_storage_key_after_signin_exists: pKeyAfterSignin,
      auth_session_cleared_at: pClearedAt,
      auth_session_cleared_reason: pClearedReason,
      login_button_pressed_at: pLoginPressedAt,
      login_handler_file: pLoginHandlerFile,
      login_handler_name: pLoginHandlerName,
      login_reached_preflight: pLoginReachedPreflight,
      login_reached_signInWithPassword: pLoginReached,
      login_preflight_has_supabase_client: pLoginHasClient,
      login_preflight_has_anon_key: pLoginHasKey,
      login_preflight_anon_key_length: pLoginKeyLen,
      login_error_source: pLoginErrSource,
      login_visible_error_message: pLoginVisibleErr,
      login_error_full_json: pLoginErrFullJson,
      login_error_name: pLoginErrName,
      login_error_message: pLoginErrMessage,
      login_error_status: pLoginErrStatus,
      login_error_code: pLoginErrCode,
      login_error_stack: pLoginErrStack,
      network_supabase_root_ok: pNetRootOk,
      network_supabase_root_status: pNetRootStatus,
      network_supabase_auth_health_ok: pNetAuthOk,
      network_supabase_auth_health_status: pNetAuthStatus,
      network_supabase_auth_health_error: pNetAuthError,
      network_raw_fetch_with_key_ok: pNetRawKeyOk,
      network_raw_fetch_with_key_status: pNetRawKeyStatus,
      network_raw_fetch_with_key_error: pNetRawKeyError,
      network_raw_auth_with_key_ok: pNetRawAuthOk,
      network_raw_auth_with_key_status: pNetRawAuthStatus,
      network_raw_auth_with_key_error: pNetRawAuthError,
      v37_req_headers_entries: pV37ReqHeaders,
      v37_req_fetch_status: pV37FetchStatus,
      v37_req_fetch_ok: pV37FetchOk,
      v37_req_fetch_body: pV37FetchBody,
      v38_req_headers_entries: pV38ReqHeaders,
      v38_req_has_apikey: pV38ReqHasApikey,
      v38_req_has_authorization: pV38ReqHasAuth,
      v38_req_fetch_status: pV38FetchStatus,
      v38_req_fetch_body: pV38FetchBody,
      v38_url_param_fetch_status: pV38UrlStatus,
      v38_url_param_fetch_body: pV38UrlBody,
    }));
  }, []);

  const runV38Probes = useCallback(async () => {
    const anonKey = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();
    const base = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
    const ranAt = new Date().toISOString();

    let v38_req_headers_entries = 'not run';
    let v38_req_has_apikey = 'not run';
    let v38_req_has_authorization = 'not run';
    let v38_req_fetch_status = 'not run';
    let v38_req_fetch_body = 'not run';

    // Test A: new Request(url, { headers: new Headers({...}) }) → fetch(req)
    try {
      const req = new Request(`${base}/auth/v1/health`, {
        method: 'GET',
        headers: new Headers({
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
        }),
      });
      v38_req_headers_entries = JSON.stringify(Array.from(req.headers.entries()));
      v38_req_has_apikey = String(req.headers.has('apikey'));
      v38_req_has_authorization = String(req.headers.has('authorization'));
      const res = await fetch(req);
      let body = '';
      try { body = await res.text(); } catch {}
      v38_req_fetch_status = String(res.status);
      v38_req_fetch_body = body.slice(0, 300);
    } catch (e: any) {
      v38_req_headers_entries = `ERROR: ${e?.message ?? 'unknown'}`;
      v38_req_fetch_status = 'error';
      v38_req_fetch_body = e?.message ?? 'unknown';
    }

    // Test B: URL-param fallback — if this works but Test A doesn't, RN strips Request headers
    let v38_url_param_fetch_status = 'not run';
    let v38_url_param_fetch_body = 'not run';
    try {
      const paramUrl = `${base}/auth/v1/health?apikey=${encodeURIComponent(anonKey)}`;
      const res = await fetch(paramUrl);
      let body = '';
      try { body = await res.text(); } catch {}
      v38_url_param_fetch_status = String(res.status);
      v38_url_param_fetch_body = body.slice(0, 300);
    } catch (e: any) {
      v38_url_param_fetch_status = 'error';
      v38_url_param_fetch_body = e?.message ?? 'unknown';
    }

    await Promise.all([
      SecureStore.setItemAsync('debug_v38_req_headers_entries', v38_req_headers_entries).catch(() => {}),
      SecureStore.setItemAsync('debug_v38_req_has_apikey', v38_req_has_apikey).catch(() => {}),
      SecureStore.setItemAsync('debug_v38_req_has_authorization', v38_req_has_authorization).catch(() => {}),
      SecureStore.setItemAsync('debug_v38_req_fetch_status', v38_req_fetch_status).catch(() => {}),
      SecureStore.setItemAsync('debug_v38_req_fetch_body', v38_req_fetch_body).catch(() => {}),
      SecureStore.setItemAsync('debug_v38_url_param_fetch_status', v38_url_param_fetch_status).catch(() => {}),
      SecureStore.setItemAsync('debug_v38_url_param_fetch_body', v38_url_param_fetch_body).catch(() => {}),
    ]);

    setAuthProbe(prev => ({
      ...prev,
      v38_ran_at: ranAt,
      v38_req_headers_entries,
      v38_req_has_apikey,
      v38_req_has_authorization,
      v38_req_fetch_status,
      v38_req_fetch_body,
      v38_url_param_fetch_status,
      v38_url_param_fetch_body,
    }));
  }, []);

  useFocusEffect(
    useCallback(() => {
      SecureStore.getItemAsync('debug_last_auth_error')
        .then(v => setAuthLastError(v ?? null))
        .catch(() => setAuthLastError(null));
      SecureStore.getItemAsync('debug_last_login_attempt')
        .then(v => setLastLoginAttempt(v ?? null))
        .catch(() => setLastLoginAttempt(null));
      runAuthProbe();
      runV38Probes();

      // Log admin debug identity fields every time the screen is opened
      const nowIso = new Date().toISOString();
      (async () => {
        let lastOpenedAt: string | null = null;
        let debugAccessEnabled = false;
        try {
          if (Platform.OS !== 'web') {
            lastOpenedAt = await SecureStore.getItemAsync('debug_last_opened_at').catch(() => null);
            await SecureStore.setItemAsync('debug_last_opened_at', nowIso).catch(() => {});
          } else if (typeof window !== 'undefined') {
            lastOpenedAt = window.localStorage.getItem('debug_last_opened_at');
            window.localStorage.setItem('debug_last_opened_at', nowIso);
          }
        } catch {}
        try {
          const { data } = await supabase.from('app_config').select('value').eq('key', 'debug_mode_enabled').maybeSingle();
          debugAccessEnabled = data?.value === true;
        } catch {}
        logDebugEvent('ADMIN_DEBUG_FIELDS', {
          admin_is_admin: profile?.is_admin === true,
          admin_is_super_admin: profile?.is_super_admin === true,
          admin_debug_access_enabled: debugAccessEnabled,
          admin_emergency_gesture_type: '5tap_logo_or_hold_5s',
          admin_emergency_tap_count_required: 5,
          admin_last_emergency_debug_opened_at: lastOpenedAt,
        });
      })();

      if (Platform.OS !== 'web') {
        const PROJECT_ID = 'cfde070c-187f-4d7e-b643-a20446ff95ab';
        const ranAt = new Date().toISOString();
        Notifications.getPermissionsAsync().then(async ({ status }) => {
          let token: string | null = null;
          if (status === 'granted') {
            try {
              const t = await Notifications.getExpoPushTokenAsync({ projectId: PROJECT_ID });
              token = t.data ?? null;
            } catch {}
          }

          // Compare device token against what's stored in the DB
          let token_in_db: boolean | null = null;
          let token_matches_device: boolean | null = null;
          let db_notifications_enabled: boolean | null = null;
          if (userId) {
            try {
              const [profileRes, settingsRes] = await Promise.all([
                supabase.from('profiles').select('push_token').eq('id', userId).maybeSingle(),
                supabase.from('user_settings').select('push_notifications_enabled').eq('user_id', userId).maybeSingle(),
              ]);
              const dbToken = profileRes.data?.push_token ?? null;
              token_in_db = dbToken !== null;
              token_matches_device = token !== null && dbToken !== null ? token === dbToken : null;
              db_notifications_enabled = settingsRes.data?.push_notifications_enabled ?? null;
            } catch {}
          }

          setPushDiag({
            ranAt,
            permission_status: status,
            token_present: token !== null,
            token_prefix: token ? token.slice(0, 30) : null,
            project_id_used: PROJECT_ID,
            last_registered_at: token ? ranAt : null,
            token_in_db,
            token_matches_device,
            db_notifications_enabled,
          });
        }).catch(() => {});
      }
    }, [runAuthProbe, runV38Probes, profile?.is_admin, profile?.is_super_admin, userId])
  );

  useEffect(() => {
    return subscribeDebugEvents(() => setEvents(getDebugEvents()));
  }, []);

  // Track auth state events so the debug screen can show the most recent one.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      setLastAuthEvent({ event, at: new Date().toISOString() });
      setAuthProbe(prev => ({ ...prev, last_auth_event: event, last_auth_event_at: new Date().toISOString() }));
    });
    return () => subscription.unsubscribe();
  }, []);

  // expo-updates values are only available in a real build, not Expo Go / dev client
  let updateId: string | null = null;
  let runtimeVersion: string | null = null;
  let channel: string | null = null;
  let isEmbeddedLaunch: boolean | null = null;
  let isEmergencyLaunch: boolean | null = null;
  let createdAt: string | null = null;
  let updatesManifestExtra: string | null = null;
  let updatesManifestMetadata: string | null = null;
  let updatesCheckForUpdateUrl: string | null = null;
  // currentlyRunning fields (expo-updates >= 0.26 / SDK 52)
  let cr_isEmbeddedLaunch: boolean | null = null;
  let cr_updateId: string | null = null;
  let cr_channel: string | null = null;
  let cr_runtimeVersion: string | null = null;
  let cr_createdAt: string | null = null;
  let cr_isEmergencyLaunch: boolean | null = null;
  let cr_manifestId: string | null = null;
  let launchDuration: number | null = null;
  try {
    // --- currentlyRunning (authoritative in SDK 52 / expo-updates 0.26+) ---
    const cr = (Updates as any).currentlyRunning ?? null;
    if (cr) {
      cr_isEmbeddedLaunch = cr.isEmbeddedLaunch ?? null;
      cr_updateId = cr.updateId ?? null;
      cr_channel = cr.channel ?? null;
      cr_runtimeVersion = cr.runtimeVersion ?? null;
      cr_isEmergencyLaunch = cr.isEmergencyLaunch ?? null;
      const crRaw = cr.createdAt ?? null;
      cr_createdAt = crRaw ? new Date(crRaw).toISOString() : null;
      cr_manifestId = cr.manifest?.id ?? null;
    }

    // --- legacy / top-level fields (may be undefined in newer SDK) ---
    updateId = Updates.updateId ?? cr_updateId ?? null;
    runtimeVersion = Updates.runtimeVersion ?? cr_runtimeVersion ?? null;
    channel = (Updates as any).channel ?? (Updates as any).manifest?.metadata?.channel ?? cr_channel ?? null;
    isEmbeddedLaunch = (Updates as any).isEmbeddedLaunch ?? cr_isEmbeddedLaunch ?? null;
    isEmergencyLaunch = (Updates as any).isEmergencyLaunch ?? cr_isEmergencyLaunch ?? null;
    const raw = (Updates as any).createdAt ?? (Updates as any).manifest?.createdAt ?? null;
    createdAt = raw ? new Date(raw).toISOString() : (cr_createdAt ?? null);
    const manifestExtra = (Updates as any).manifest?.extra;
    updatesManifestExtra = manifestExtra !== undefined ? JSON.stringify(manifestExtra) : null;
    const manifestMeta = (Updates as any).manifest?.metadata;
    updatesManifestMetadata = manifestMeta !== undefined ? JSON.stringify(manifestMeta) : null;
    updatesCheckForUpdateUrl = (Updates as any).checkForUpdateUrl ?? null;
    launchDuration = (Updates as any).launchDuration ?? null;

    // expo-updates >=0.26 exposes native request headers (includes expo-channel-name)
    const nativeHeaders = (Updates as any).requestHeaders ?? (Updates as any).nativeDebug?.requestHeaders ?? null;
    if (nativeHeaders) {
      channel = channel ?? nativeHeaders['expo-channel-name'] ?? null;
    }
  } catch {}

  const appVersion = Constants.default?.expoConfig?.version ?? null;
  const nativeVersion = Constants.default?.nativeAppVersion ?? null;
  const buildVersion = Constants.default?.nativeBuildVersion ?? null;

  // Session / token derived values
  const tokenPresent = !!session?.access_token;
  const sessionExpiry = session?.expires_at
    ? new Date(session.expires_at * 1000).toISOString()
    : null;
  const tokenExpiryCountdown = session?.expires_at
    ? Math.max(0, Math.round(session.expires_at - Date.now() / 1000))
    : null;
  const supabaseUrlHost = process.env.EXPO_PUBLIC_SUPABASE_URL
    ? (() => { try { return new URL(process.env.EXPO_PUBLIC_SUPABASE_URL!).hostname; } catch { return null; } })()
    : null;
  const dbProjectRef = supabaseUrlHost
    ? supabaseUrlHost.replace(/\.supabase\.co$/, '')
    : null;
  const supabaseKeyLength = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.length ?? 0;
  const jwtDecodeDebug: {
    parts: number | null;
    payloadDecodes: boolean;
    role: string | null;
    ref: string | null;
    iss: string | null;
    exp: string | null;
  } = (() => {
    try {
      const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
      if (!key) return { parts: null, payloadDecodes: false, role: null, ref: null, iss: null, exp: null };
      const parts = key.split('.');
      const partCount = parts.length;
      const rawPayload = parts[1];
      if (!rawPayload) return { parts: partCount, payloadDecodes: false, role: null, ref: null, iss: null, exp: null };
      const base64 = rawPayload.replace(/-/g, '+').replace(/_/g, '/');
      const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
      const json = JSON.parse(atob(padded));
      return {
        parts: partCount,
        payloadDecodes: true,
        role: json?.role ?? null,
        ref: json?.ref ?? null,
        iss: json?.iss ?? null,
        exp: json?.exp ? new Date(json.exp * 1000).toISOString() : null,
      };
    } catch {
      return { parts: null, payloadDecodes: false, role: null, ref: null, iss: null, exp: null };
    }
  })();
  // Keep a compat alias used by the share payload
  const anonKeyProjectRefDecoded = jwtDecodeDebug.ref;

  // Boot timing from event log
  const lastBootEvent = events.find(e => e.tag === 'LAUNCH BOOT');
  const bootElapsedMs = (lastBootEvent?.data?.bootElapsedMs as number) ?? null;

  // Launch route decision from event log
  const lastRouteDecision = events.find(e => e.tag === 'LAUNCH ROUTE DECISION');
  const sessionHydrated = !loading;
  const sessionValidAtLaunch = (lastRouteDecision?.data?.sessionValidAtLaunch as boolean) ?? (!!session);
  const privacyModeEnabled = settings?.stealth_mode_enabled ?? null;
  const requireUnlockAfterSeconds = settings?.lock_after_seconds ?? null;
  const lastUnlockedAt = unlockedAtMs;
  const unlockRequiredReason = (lastRouteDecision?.data?.unlockRequiredReason as string) ?? (isUnlockRequired ? `lock_after_seconds=${settings?.lock_after_seconds}, method=${settings?.login_method}` : 'none');
  const initialRouteDecision = (lastRouteDecision?.data?.initialRouteDecision as string) ?? null;
  const routeDecisionReason = (lastRouteDecision?.data?.routeDecisionReason as string) ?? null;
  const fakeWeatherShownReason = (lastRouteDecision?.data?.fakeWeatherShownReason as string) ?? null;

  // Vault upload diagnostics from event log
  const lastVaultPick = events.find(e => e.tag === 'VAULT PICK');
  const lastVaultUploadStart = events.find(e => e.tag === 'VAULT UPLOAD START');
  const lastVaultUploadSuccess = events.find(e => e.tag === 'VAULT UPLOAD SUCCESS');
  const lastVaultUploadError = events.find(e => e.tag === 'VAULT UPLOAD ERROR');

  const uploadPathTemplate = couple?.id && userId
    ? `${couple.id}/${userId}/{ts}.ext`
    : couple?.id
    ? `${couple.id}/{user_id}/{ts}.ext`
    : '{couple_id}/{user_id}/{ts}.ext';

  // --- Action: Test generate_invite_code RPC ---
  const handleTestRpc = async () => {
    setRpcTest({ status: 'loading', ranAt: new Date().toISOString(), result: null, error: null });
    try {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('RPC test timed out after 10 seconds')), 10000)
      );
      const { data, error } = await Promise.race([
        supabase.rpc('generate_invite_code'),
        timeoutPromise,
      ]) as any;

      const ranAt = new Date().toISOString();
      if (error) {
        const finalState = {
          status: 'error' as const,
          ranAt,
          result: null,
          error: {
            code: error.code ?? null,
            message: error.message ?? null,
            details: (error.details as string) ?? null,
            hint: (error.hint as string) ?? null,
          },
        };
        setRpcTest(finalState);
        logDebugEvent('RPC TEST FINISHED', { status: 'error', code: error.code ?? null, message: error.message ?? null });
      } else {
        const finalState = { status: 'success' as const, ranAt, result: data, error: null };
        setRpcTest(finalState);
        logDebugEvent('RPC TEST FINISHED', {
          status: 'success',
          success: (data as any)?.success ?? null,
          invite_code: (data as any)?.invite_code ?? null,
          couple_id: (data as any)?.couple_id ?? null,
        });
      }
    } catch (e: any) {
      const isTimeout = e?.message?.includes('timed out');
      const ranAt = new Date().toISOString();
      const finalState = {
        status: (isTimeout ? 'timeout' : 'error') as 'timeout' | 'error',
        ranAt,
        result: null,
        error: { code: null, message: e?.message ?? String(e), details: null, hint: null },
      };
      setRpcTest(finalState);
      logDebugEvent('RPC TEST FINISHED', { status: finalState.status, message: e?.message ?? String(e) });
    }
  };

  // Auto-run RPC test on mount once userId is available
  useEffect(() => {
    if (!userId) return;
    handleTestRpc();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Action: Test debug_database_identity RPC ---
  const handleTestDbIdentity = async () => {
    setDbIdentity({ status: 'loading', ranAt: null, result: null, error: null });
    try {
      const { data, error } = await supabase.rpc('debug_database_identity');
      const ranAt = new Date().toISOString();
      if (error) {
        setDbIdentity({
          status: 'error',
          ranAt,
          result: null,
          error: {
            code: error.code ?? null,
            message: error.message ?? null,
            details: (error.details as string) ?? null,
            hint: (error.hint as string) ?? null,
          },
        });
      } else {
        setDbIdentity({ status: 'success', ranAt, result: data, error: null });
      }
    } catch (e: any) {
      setDbIdentity({
        status: 'error',
        ranAt: new Date().toISOString(),
        result: null,
        error: { code: null, message: e?.message ?? String(e), details: null, hint: null },
      });
    }
  };

  // --- Action: Re-register push token (force token refresh + save to DB) ---
  const [reRegisterStatus, setReRegisterStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const handleReRegisterToken = async () => {
    if (Platform.OS === 'web' || !userId) return;
    setReRegisterStatus('running');
    try {
      const token = await registerForPushNotifications();
      if (token) {
        await savePushToken(userId, token);
        setReRegisterStatus('done');
      } else {
        setReRegisterStatus('error');
      }
    } catch {
      setReRegisterStatus('error');
    }
    // Refresh push diag rows after re-registration
    const PROJECT_ID = 'cfde070c-187f-4d7e-b643-a20446ff95ab';
    const ranAt = new Date().toISOString();
    try {
      const { status } = await Notifications.getPermissionsAsync();
      let token: string | null = null;
      if (status === 'granted') {
        try {
          const t = await Notifications.getExpoPushTokenAsync({ projectId: PROJECT_ID });
          token = t.data ?? null;
        } catch {}
      }
      const [profileRes, settingsRes] = await Promise.all([
        supabase.from('profiles').select('push_token').eq('id', userId).maybeSingle(),
        supabase.from('user_settings').select('push_notifications_enabled').eq('user_id', userId).maybeSingle(),
      ]);
      const dbToken = profileRes.data?.push_token ?? null;
      setPushDiag({
        ranAt,
        permission_status: status,
        token_present: token !== null,
        token_prefix: token ? token.slice(0, 30) : null,
        project_id_used: PROJECT_ID,
        last_registered_at: token ? ranAt : null,
        token_in_db: dbToken !== null,
        token_matches_device: token !== null && dbToken !== null ? token === dbToken : null,
        db_notifications_enabled: settingsRes.data?.push_notifications_enabled ?? null,
      });
    } catch {}
  };

  // --- Action: Local test notification (proves in-app handler, no server) ---
  const handleLocalTestNotification = async () => {
    if (Platform.OS === 'web') return;
    setLocalTestSent('sending');
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Warm Me Up',
          body: '[Debug] Local test notification — app can display notifications',
          data: { event_type: 'debug_local_test' },
          sound: 'default',
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 1 },
      });
      setLocalTestSent('sent');
    } catch {
      setLocalTestSent('error');
    }
  };

  // --- Action: End-to-end push test (self + partner via edge function) ---
  const handleTestPush = async (force = false) => {
    if (Platform.OS === 'web' || !userId || !couple?.id) return;

    const EAS_PROJECT_ID = 'cfde070c-187f-4d7e-b643-a20446ff95ab';
    const resetState = {
      running: true,
      step: 'start' as string | null,
      ranAt: new Date().toISOString(),
      permission_status: null as string | null,
      token_present: null as boolean | null,
      token_saved_to_db: null as boolean | null,
      partner_token_present: null as boolean | null,
      partner_enabled: null as boolean | null,
      self: { ...PUSH_TEST_SUB_IDLE, status: 'idle' as const },
      partner: { ...PUSH_TEST_SUB_IDLE, status: 'idle' as const },
      top_error: null as string | null,
    };
    setPushTest(resetState);

    try {
      // Step 1: Re-register and refresh token
      setPushTest(p => ({ ...p, step: 'checking_permission' }));
      const { status: existing } = await Notifications.getPermissionsAsync();
      let finalStatus = existing;
      if (existing !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      setPushTest(p => ({ ...p, permission_status: finalStatus }));

      if (finalStatus !== 'granted') {
        setPushTest(p => ({
          ...p, running: false, step: 'done', token_present: false, token_saved_to_db: false,
          top_error: 'Push permission not granted',
        }));
        return;
      }

      setPushTest(p => ({ ...p, step: 'getting_token' }));
      let token: string | null = null;
      try {
        const t = await Notifications.getExpoPushTokenAsync({ projectId: EAS_PROJECT_ID });
        token = t.data ?? null;
      } catch (e: any) {
        setPushTest(p => ({ ...p, running: false, step: 'done', token_present: false, token_saved_to_db: false, top_error: `getExpoPushTokenAsync failed: ${e?.message ?? String(e)}` }));
        return;
      }
      setPushTest(p => ({ ...p, token_present: token !== null }));

      if (!token) {
        setPushTest(p => ({ ...p, running: false, step: 'done', token_saved_to_db: false, top_error: 'No token returned from Expo' }));
        return;
      }

      // Step 2: Save token to DB
      setPushTest(p => ({ ...p, step: 'saving_token' }));
      await savePushToken(userId, token);

      // Verify it was saved
      const { data: savedProfile } = await supabase
        .from('profiles')
        .select('push_token')
        .eq('id', userId)
        .maybeSingle();
      const tokenSaved = savedProfile?.push_token === token;
      setPushTest(p => ({ ...p, token_saved_to_db: tokenSaved }));

      const baseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
      const anonKey = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setPushTest(p => ({ ...p, running: false, step: 'done', top_error: 'No active session' }));
        return;
      }

      // Edge call with 15s client-side abort so the UI never hangs permanently
      const EDGE_TIMEOUT_MS = 15_000;
      const callEdge = async (target: 'self' | 'partner', forceFlag: boolean) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), EDGE_TIMEOUT_MS);
        try {
          const res = await fetch(`${baseUrl}/functions/v1/send-test-push`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session.access_token}`,
              Apikey: anonKey,
            },
            body: JSON.stringify({ target, couple_id: couple.id, force: forceFlag }),
            signal: controller.signal,
          });
          const body = await res.json() as any;
          return { httpStatus: res.status as number | null, body };
        } catch (e: any) {
          const isAbort = e?.name === 'AbortError';
          return {
            httpStatus: null as number | null,
            body: { ok: false, error: isAbort ? `Timed out after ${EDGE_TIMEOUT_MS / 1000}s — edge function did not respond` : (e?.message ?? String(e)) },
          };
        } finally {
          clearTimeout(timer);
        }
      };

      // Step 3: Self send (includes Expo push + 3s receipt delay inside edge function)
      setPushTest(p => ({ ...p, step: 'sending_self', self: { ...p.self, status: 'loading', step: 'sending_to_expo' } }));
      try {
        const { httpStatus, body } = await callEdge('self', false);
        setPushTest(p => ({
          ...p,
          step: 'self_done',
          self: {
            status: httpStatus === 200 && body?.ok ? 'success' : 'error',
            step: 'done',
            send_status: httpStatus,
            expo_status: body?.expo_status ?? null,
            skipped_reason: body?.skipped ?? null,
            error: body?.error ?? null,
            expo_ticket_id: body?.expo_ticket_id ?? body?.ticket_id ?? null,
            expo_payload_sent: body?.expo_payload_sent ?? null,
            receipt_request_started: body?.receipt_request_started ?? null,
            receipt_request_finished: body?.receipt_request_finished ?? null,
            receipt_timeout: body?.receipt_timeout ?? null,
            receipt_status: body?.receipt_status ?? null,
            receipt_details: body?.receipt_details ?? null,
            receipt_error: body?.receipt_error ?? null,
            receipt_response: body?.receipt_response ?? null,
          },
        }));
      } catch (e: any) {
        setPushTest(p => ({
          ...p,
          step: 'self_done',
          self: { ...PUSH_TEST_SUB_IDLE, status: 'error', step: 'done', error: e?.message ?? String(e) },
        }));
      }

      // Step 4: Partner send — read partner token/enabled from response
      setPushTest(p => ({ ...p, step: 'sending_partner', partner: { ...p.partner, status: 'loading', step: 'sending_to_expo' } }));
      try {
        const { httpStatus, body } = await callEdge('partner', force);
        setPushTest(p => ({
          ...p,
          step: 'partner_done',
          partner_token_present: body?.token_present ?? null,
          partner_enabled: body?.partner_enabled ?? null,
          partner: {
            status: httpStatus === 200 && body?.ok ? 'success' : 'error',
            step: 'done',
            send_status: httpStatus,
            expo_status: body?.expo_status ?? null,
            skipped_reason: body?.skipped ?? null,
            error: body?.error ?? null,
            expo_ticket_id: body?.expo_ticket_id ?? body?.ticket_id ?? null,
            expo_payload_sent: body?.expo_payload_sent ?? null,
            receipt_request_started: body?.receipt_request_started ?? null,
            receipt_request_finished: body?.receipt_request_finished ?? null,
            receipt_timeout: body?.receipt_timeout ?? null,
            receipt_status: body?.receipt_status ?? null,
            receipt_details: body?.receipt_details ?? null,
            receipt_error: body?.receipt_error ?? null,
            receipt_response: body?.receipt_response ?? null,
          },
        }));
      } catch (e: any) {
        setPushTest(p => ({
          ...p,
          step: 'partner_done',
          partner: { ...PUSH_TEST_SUB_IDLE, status: 'error', step: 'done', error: e?.message ?? String(e) },
        }));
      }
    } catch (e: any) {
      setPushTest(p => ({ ...p, top_error: e?.message ?? String(e) }));
    } finally {
      setPushTest(p => ({ ...p, running: false, step: p.step === 'start' ? 'done' : p.step }));
    }
  };

  // --- Action: Check for OTA update ---
  const handleCheckUpdate = async () => {
    setCheckUpdate({ status: 'loading', ranAt: new Date().toISOString(), isAvailable: null, manifest: null, error: null });
    try {
      const result = await Updates.checkForUpdateAsync();
      setCheckUpdate({
        status: 'success',
        ranAt: new Date().toISOString(),
        isAvailable: result.isAvailable,
        manifest: result.isAvailable && (result as any).manifest
          ? JSON.stringify((result as any).manifest, null, 2)
          : null,
        error: null,
      });
    } catch (e: any) {
      setCheckUpdate({
        status: 'error',
        ranAt: new Date().toISOString(),
        isAvailable: null,
        manifest: null,
        error: e?.message ?? String(e),
      });
    }
  };

  // --- Action: Fetch + Apply OTA update ---
  const handleFetchAndApplyUpdate = async () => {
    setApplyUpdate({ status: 'checking', ranAt: new Date().toISOString(), error: null });
    try {
      const check = await Updates.checkForUpdateAsync();
      if (!check.isAvailable) {
        setApplyUpdate({ status: 'no-update', ranAt: new Date().toISOString(), error: null });
        return;
      }
      setApplyUpdate({ status: 'fetching', ranAt: new Date().toISOString(), error: null });
      await Updates.fetchUpdateAsync();
      setApplyUpdate({ status: 'reloading', ranAt: new Date().toISOString(), error: null });
      await Updates.reloadAsync();
    } catch (e: any) {
      setApplyUpdate({ status: 'error', ranAt: new Date().toISOString(), error: e?.message ?? String(e) });
    }
  };

  // --- Action: Test getSession ---
  const handleTestGetSession = async () => {
    setSessionTest({ status: 'loading', ranAt: new Date().toISOString(), result: null, error: null });
    try {
      const { data, error: err } = await supabase.auth.getSession();
      const ranAt = new Date().toISOString();
      console.log('[DebugScreen] GET SESSION', JSON.stringify({ data, error: err }, null, 2));
      if (err) {
        setSessionTest({ status: 'error', ranAt, result: null, error: JSON.stringify(err, null, 2) });
      } else {
        setSessionTest({
          status: 'success',
          ranAt,
          result: JSON.stringify({
            hasSession: !!data.session,
            userId: data.session?.user?.id ?? null,
            email: data.session?.user?.email ?? null,
            expiresAt: data.session?.expires_at ?? null,
          }, null, 2),
          error: null,
        });
      }
    } catch (e: any) {
      console.error('[DebugScreen] GET SESSION error', e);
      setSessionTest({ status: 'error', ranAt: new Date().toISOString(), result: null, error: e?.message ?? String(e) });
    }
  };

  // --- Action: Test DB (profiles select) ---
  const handleTestDb = async () => {
    setDbTest({ status: 'loading', ranAt: new Date().toISOString(), result: null, error: null });
    try {
      const { data, error: err } = await supabase.from('profiles').select('id').limit(1);
      const ranAt = new Date().toISOString();
      console.log('[DebugScreen] DB TEST', JSON.stringify({ data, error: err }, null, 2));
      if (err) {
        setDbTest({ status: 'error', ranAt, result: null, error: JSON.stringify(err, null, 2) });
      } else {
        setDbTest({ status: 'success', ranAt, result: JSON.stringify(data, null, 2), error: null });
      }
    } catch (e: any) {
      console.error('[DebugScreen] DB TEST error', e);
      setDbTest({ status: 'error', ranAt: new Date().toISOString(), result: null, error: e?.message ?? String(e) });
    }
  };

  // --- Action: Clear Local Device State ---
  const handleClearLocalState = () => {
    Alert.alert(
      'Clear Local Device State',
      'Deletes PIN, unlock timer, and weather cache from this device. You will stay logged in.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            setClearing(true);
            try {
              if (userId && Platform.OS !== 'web') {
                const pinKey = secureKey('warmup_pin', userId);
                await SecureStore.deleteItemAsync(pinKey).catch(() => {});
                const unlockKey = secureKey('warmup_unlocked_at', userId);
                await SecureStore.deleteItemAsync(unlockKey).catch(() => {});
              } else if (userId && typeof window !== 'undefined') {
                window.localStorage.removeItem(secureKey('warmup_pin', userId));
              }
              clearWeatherSessionCache();
              if (userId) hasPinStored(userId).then(setHasPin).catch(() => {});
              Alert.alert('Done', 'Local device state cleared.');
            } catch (e) {
              console.error('[DebugScreen] clearLocalState error:', e);
            } finally {
              setClearing(false);
            }
          },
        },
      ],
    );
  };

  // --- Action: Force Logout ---
  const handleForceLogout = () => {
    Alert.alert(
      'Force Logout',
      'Signs out of Supabase immediately and returns to welcome screen.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            setLoggingOut(true);
            try {
              await supabase.auth.signOut();
              signOut();
              router.replace('/(auth)/welcome');
            } catch (e) {
              console.error('[DebugScreen] forceLogout error:', e);
              setLoggingOut(false);
            }
          },
        },
      ],
    );
  };

  // --- Action: Reset Security Settings ---
  const handleResetSecurity = () => {
    Alert.alert(
      'Reset Security Settings',
      'Sets login_method=password, disables stealth mode, and sets lock_after_seconds=-1 (Never Lock) in Supabase. PIN on this device is not deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            setResetting(true);
            try {
              if (!userId) throw new Error('No user id');
              const { error } = await supabase
                .from('user_settings')
                .update({
                  login_method: 'password',
                  lock_after_seconds: -1,
                  stealth_mode_enabled: false,
                })
                .eq('user_id', userId);
              if (error) throw error;
              await refreshSettings();
              Alert.alert('Done', 'Security settings reset.');
            } catch (e: any) {
              console.error('[DebugScreen] resetSecurity error:', e);
              Alert.alert('Error', e?.message ?? 'Could not reset security settings.');
            } finally {
              setResetting(false);
            }
          },
        },
      ],
    );
  };

  // --- Action: Copy Debug Info via native Share sheet ---
  const handleShareDebugInfo = async () => {
    const lastErr = lastVaultUploadError?.data ?? null;
    const info: Record<string, unknown> = {
      APP_CODE_VERSION, OTA_MARKER, gitSha: GIT_SHA,
      updateId, runtimeVersion, channel, isEmbeddedLaunch, isEmergencyLaunch, createdAt,
      appVersion, nativeAppVersion: nativeVersion, nativeBuildVersion: buildVersion,
      userId,
      email: user?.email ?? session?.user?.email ?? null,
      is_admin: profile?.is_admin ?? null,
      is_super_admin: profile?.is_super_admin ?? null,
      login_method: settings?.login_method ?? null,
      stealth_mode_enabled: settings?.stealth_mode_enabled ?? null,
      lock_after_seconds: settings?.lock_after_seconds ?? null,
      unlockedAtMs,
      hasStoredPIN: hasPin,
      isUnlockRequired,
      shouldShowPrivacyCover,
      blur_on_background: settings?.blur_on_background ?? null,
      push_notifications_enabled: settings?.push_notifications_enabled ?? null,
      bootElapsedMs,
      tokenPresent, sessionExpiry, tokenExpiryCountdown,
      supabaseUrlHost, dbProjectRef,
      anonKeyPrefix24: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.slice(0, 24) ?? null,
      anonKeyProjectRefDecoded,
      sub_loading: subscriptionInfo.loading,
      sub_isPremium: subscriptionInfo.isPremium,
      sub_isOnTrial: subscriptionInfo.isOnTrial,
      sub_source: subscriptionInfo.source,
      sub_plan: (subscriptionInfo as any).plan ?? null,
      sub_expiresAt: (subscriptionInfo as any).expiresAt ?? null,
      sub_trialExpired: subscriptionInfo.trialExpired,
      sub_canInvite: (subscriptionInfo as any).canInvite ?? null,
      couple_id: couple?.id ?? null,
      couple_active: couple?.active ?? null,
      activeCoupleFound,
      inactiveCoupleCount,
      couple_user_a_id: couple?.user_a_id ?? null,
      couple_user_b_id: couple?.user_b_id ?? null,
      couple_points_enabled: couple?.points_enabled ?? null,
      couple_streaks_enabled: couple?.streaks_enabled ?? null,
      couple_subscription_owner_id: couple?.subscription_owner_id ?? null,
      canRefreshInviteCode,
      refreshBlockReason,
      couple_invite_code: couple?.invite_code ?? null,
      rpc_test: rpcTest,
      push_diag: pushDiag,
      push_test: pushTest,
      vault_bucket: 'vault',
      vault_uploadPathTemplate: uploadPathTemplate,
      vault_lastPickAt: lastVaultPick?.timestamp ?? null,
      vault_lastPickMime: lastVaultPick?.data?.mimeType ?? null,
      vault_lastUploadStartAt: lastVaultUploadStart?.timestamp ?? null,
      vault_lastUploadStartBlobSize: lastVaultUploadStart?.data?.blobSize ?? null,
      vault_lastUploadSuccessAt: lastVaultUploadSuccess?.timestamp ?? null,
      vault_lastUploadSuccessPath: lastVaultUploadSuccess?.data?.storagePath ?? null,
      vault_lastErrorAt: lastVaultUploadError?.timestamp ?? null,
      vault_lastErrorReason: lastErr?.reason ?? lastErr?.supabaseError ?? lastErr?.error ?? null,
      vault_lastErrorHttpStatus: lastErr?.httpStatus ?? null,
      vault_lastErrorSupabaseMessage: lastErr?.supabaseMessage ?? null,
      vault_lastErrorFullBody: lastErr ? JSON.stringify(lastErr) : null,
      currentRoute: pathname,
      capturedAt: new Date().toISOString(),
      recentEvents: events.slice(0, 20).map(e => ({ tag: e.tag, ts: e.timestamp, ...e.data })),
      auth_storage_adapter: authProbe.auth_storage_adapter,
      auth_storage_keys_found: authProbe.auth_storage_keys_found,
      auth_storage_session_key_exists: authProbe.auth_storage_session_key_exists,
      auth_storage_session_raw_length: authProbe.auth_storage_session_raw_length,
      auth_storage_session_parse_ok: authProbe.auth_storage_session_parse_ok,
      auth_storage_session_user_id: authProbe.auth_storage_session_user_id,
      auth_storage_session_expires_at: authProbe.auth_storage_session_expires_at,
      auth_getSession_ran_at: authProbe.auth_getSession_ran_at,
      auth_getSession_has_session: authProbe.auth_getSession_has_session,
      auth_getSession_user_id: authProbe.auth_getSession_user_id,
      auth_getSession_error_message: authProbe.auth_getSession_error_message,
      auth_getUser_ran_at: authProbe.auth_getUser_ran_at,
      auth_getUser_has_user: authProbe.auth_getUser_has_user,
      auth_getUser_user_id: authProbe.auth_getUser_user_id,
      auth_getUser_error_message: authProbe.auth_getUser_error_message,
      last_auth_event: authProbe.last_auth_event,
      last_auth_event_at: authProbe.last_auth_event_at,
      auth_last_signin_success: authProbe.auth_last_signin_success,
      auth_last_signin_user_id: authProbe.auth_last_signin_user_id,
      auth_last_signin_session_present: authProbe.auth_last_signin_session_present,
      auth_last_signin_access_token_present: authProbe.auth_last_signin_access_token_present,
      auth_last_signin_refresh_token_present: authProbe.auth_last_signin_refresh_token_present,
      auth_after_signin_getSession_has_session: authProbe.auth_after_signin_getSession_has_session,
      auth_after_signin_getSession_user_id: authProbe.auth_after_signin_getSession_user_id,
      auth_after_signin_storage_keys_found: authProbe.auth_after_signin_storage_keys_found,
      auth_after_signin_session_key_exists: authProbe.auth_after_signin_session_key_exists,
      auth_after_signin_session_raw_length: authProbe.auth_after_signin_session_raw_length,
      auth_after_signin_session_parse_ok: authProbe.auth_after_signin_session_parse_ok,
      auth_session_cleared_at: authProbe.auth_session_cleared_at,
      auth_session_cleared_reason: authProbe.auth_session_cleared_reason,
      login_button_pressed_at: authProbe.login_button_pressed_at,
      login_handler_file: authProbe.login_handler_file,
      login_handler_name: authProbe.login_handler_name,
      login_reached_preflight: authProbe.login_reached_preflight,
      login_reached_signInWithPassword: authProbe.login_reached_signInWithPassword,
      login_preflight_has_supabase_client: authProbe.login_preflight_has_supabase_client,
      login_preflight_has_anon_key: authProbe.login_preflight_has_anon_key,
      login_preflight_anon_key_length: authProbe.login_preflight_anon_key_length,
      login_error_source: authProbe.login_error_source,
      login_visible_error_message: authProbe.login_visible_error_message,
      login_error_full_json: authProbe.login_error_full_json,
      login_error_name: authProbe.login_error_name,
      login_error_message: authProbe.login_error_message,
      login_error_status: authProbe.login_error_status,
      login_error_code: authProbe.login_error_code,
      login_error_stack: authProbe.login_error_stack,
      network_supabase_root_ok: authProbe.network_supabase_root_ok,
      network_supabase_root_status: authProbe.network_supabase_root_status,
      network_supabase_auth_health_ok: authProbe.network_supabase_auth_health_ok,
      network_supabase_auth_health_status: authProbe.network_supabase_auth_health_status,
      network_supabase_auth_health_error: authProbe.network_supabase_auth_health_error,
      network_raw_fetch_with_key_ok: authProbe.network_raw_fetch_with_key_ok,
      network_raw_fetch_with_key_status: authProbe.network_raw_fetch_with_key_status,
      network_raw_fetch_with_key_error: authProbe.network_raw_fetch_with_key_error,
      network_raw_auth_with_key_ok: authProbe.network_raw_auth_with_key_ok,
      network_raw_auth_with_key_status: authProbe.network_raw_auth_with_key_status,
      network_raw_auth_with_key_error: authProbe.network_raw_auth_with_key_error,
      v37_req_headers_entries: authProbe.v37_req_headers_entries,
      v37_req_fetch_status: authProbe.v37_req_fetch_status,
      v37_req_fetch_ok: authProbe.v37_req_fetch_ok,
      v37_req_fetch_body: authProbe.v37_req_fetch_body,
      v38_ran_at: authProbe.v38_ran_at,
      v38_req_headers_entries: authProbe.v38_req_headers_entries,
      v38_req_has_apikey: authProbe.v38_req_has_apikey,
      v38_req_has_authorization: authProbe.v38_req_has_authorization,
      v38_req_fetch_status: authProbe.v38_req_fetch_status,
      v38_req_fetch_body: authProbe.v38_req_fetch_body,
      v38_url_param_fetch_status: authProbe.v38_url_param_fetch_status,
      v38_url_param_fetch_body: authProbe.v38_url_param_fetch_body,
    };

    try {
      await Share.share({ message: JSON.stringify(info, null, 2) });
    } catch (e) {
      console.warn('[DebugScreen] share error:', e);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* OTA banner — text sourced from OTA_MARKER in lib/appVersion.ts */}
      <View style={styles.otaBanner}>
        <AppText style={styles.otaBannerText}>{OTA_MARKER}</AppText>
      </View>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.canGoBack() ? router.back() : router.replace('/(auth)/login')}
          style={styles.back}
          hitSlop={12}
        >
          <ChevronLeft size={22} color="#aaa" />
        </TouchableOpacity>
        <AppText style={styles.title}>Debug Diagnostics</AppText>
        <View style={{ width: 44 }} />
      </View>

      {/* Non-super-admin: show safe limited view only */}
      {!isSuperAdmin && !__DEV__ && (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40, gap: 12 }]}>
          <Section title="APP" />
          <Row label="version_code" value={APP_CODE_VERSION} />
          <Row label="ota_marker" value={OTA_MARKER} />
          <Row label="platform" value={Platform.OS} />
          <Row label="user_id_prefix" value={user?.id ? user.id.slice(0, 8) + '…' : null} />
          <Row label="signed_in" value={!!session} />
          <Row label="couple_active" value={couple?.active ?? null} />
          <Section title="SUPPORT" />
          <AppText style={[styles.label, { color: '#999', fontSize: 12, paddingHorizontal: 16, lineHeight: 18 }]}>
            {'Hold the Warm Me Up logo for 5 seconds to reach this screen.\nShare your user_id_prefix with support when reporting an issue.'}
          </AppText>
        </ScrollView>
      )}

      {/* Super-admin or __DEV__: full diagnostics */}
      {(isSuperAdmin || __DEV__) && (
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── CRITICAL: Build Config (visible without login) ── */}
        <Section title="Build Config — verify these first" />
        <Row label="APP_CODE_VERSION" value={APP_CODE_VERSION} />
        <Row label="OTA_MARKER" value={OTA_MARKER} />
        <Row label="supabaseUrlHost" value={supabaseUrlHost} />
        <Row label="dbProjectRef" value={dbProjectRef} />
        <Row label="anonKeyPresent" value={Boolean(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY)} />
        <Row label="supabaseKeyLength" value={supabaseKeyLength} />
        <Row label="jwt.role" value={jwtDecodeDebug.role} />
        <Row label="jwt.ref" value={jwtDecodeDebug.ref} />
        <Row label="jwt.payloadDecodes" value={jwtDecodeDebug.payloadDecodes} />
        <Row
          label="api_key_validation"
          value={(() => {
            const hostRef = dbProjectRef;
            const decodedRef = jwtDecodeDebug.ref;
            const match = hostRef && decodedRef ? hostRef === decodedRef : null;
            return `hostRef=${hostRef ?? 'null'} decodedRef=${decodedRef ?? 'null'} match=${match === null ? 'unknown' : match}`;
          })()}
        />
        <Row label="channel" value={channel} />
        <Row label="cr.channel" value={cr_channel} />
        <Row label="manifest.metadata.channel" value={(() => { try { return (Updates as any).manifest?.metadata?.channel ?? null; } catch { return null; } })()} />
        <Row label="isEmbeddedLaunch (legacy)" value={isEmbeddedLaunch} />
        <Row label="cr.isEmbeddedLaunch" value={cr_isEmbeddedLaunch} />
        <Row label="updateId" value={updateId} />
        <Row label="createdAt" value={createdAt} />

        {/* ── 0. App Code Version ── */}
        <Section title="App Code Version" />
        <Row label="APP_CODE_VERSION" value={APP_CODE_VERSION} />
        <Row label="OTA_MARKER" value={OTA_MARKER} />
        <Row label="gitSha" value={GIT_SHA} />
        <Row label="updateId" value={updateId} />
        <Row label="createdAt" value={createdAt} />
        <Row label="isEmbeddedLaunch" value={isEmbeddedLaunch} />
        <Row label="runtimeVersion" value={runtimeVersion} />
        <Row label="channel" value={channel} />

        {/* ── JS Bundle Identity ── */}
        <Section title="JS Bundle Identity" />
        <Row label="bundle_source" value={isEmbeddedLaunch ? 'embedded (native build)' : (updateId ? `ota:${updateId}` : 'unknown')} />
        <Row label="APP_CODE_VERSION (lib/appVersion.ts)" value={APP_CODE_VERSION} />
        <Row label="OTA_MARKER (lib/appVersion.ts)" value={OTA_MARKER} />
        <Row label="Updates.updateId" value={updateId} />
        <Row label="Updates.createdAt" value={createdAt} />
        <Row label="Updates.isEmbeddedLaunch" value={isEmbeddedLaunch} />
        <Row label="Updates.channel" value={channel} />

        {/* ── 1. Launch / Auth State ── */}
        <Section title="Launch / Auth State" />
        <Row label="sessionHydrated" value={sessionHydrated} />
        <Row label="sessionValidAtLaunch" value={sessionValidAtLaunch} />
        <Row label="privacyModeEnabled" value={privacyModeEnabled} />
        <Row label="requireUnlockAfterSeconds" value={requireUnlockAfterSeconds} />
        <Row label="lastUnlockedAt" value={lastUnlockedAt} />
        <Row label="unlockRequiredReason" value={unlockRequiredReason} />
        <Row label="initialRouteDecision" value={initialRouteDecision} />
        <Row label="routeDecisionReason" value={routeDecisionReason} />
        <Row label="fakeWeatherShownReason" value={fakeWeatherShownReason} />
        <Row label="userId" value={userId} />
        <Row label="email" value={user?.email ?? session?.user?.email ?? null} />
        <Row label="is_admin" value={profile?.is_admin ?? null} />
        <Row label="is_super_admin" value={profile?.is_super_admin ?? null} />
        <Row label="login_method" value={settings?.login_method ?? null} />
        <Row label="stealth_mode_enabled" value={settings?.stealth_mode_enabled ?? null} />
        <Row label="lock_after_seconds" value={settings?.lock_after_seconds ?? null} />
        <Row label="unlockedAtMs" value={unlockedAtMs} />
        <Row label="hasStoredPIN" value={hasPin} />
        <Row label="isUnlockRequired" value={isUnlockRequired} />
        <Row label="shouldShowPrivacyCover" value={shouldShowPrivacyCover} />
        <Row label="blur_on_background" value={settings?.blur_on_background ?? null} />
        <Row label="push_notifications_enabled" value={settings?.push_notifications_enabled ?? null} />
        <Row label="bootElapsedMs" value={bootElapsedMs} />

        {/* ── 1b. Push Notifications State ── */}
        <Section title="Push Notifications" />
        <Row label="push.ranAt" value={pushDiag.ranAt} />
        <Row label="push.permission_status" value={pushDiag.permission_status} />
        {pushDiag.permission_status === 'denied' && (
          <View style={styles.blockedBanner}>
            <AppText style={styles.blockedBannerText}>BLOCKED — user must enable in iOS Settings &gt; Warm Me Up &gt; Notifications</AppText>
          </View>
        )}
        <Row label="push.token_present" value={pushDiag.token_present} />
        <Row label="push.token_prefix" value={pushDiag.token_prefix} />
        <Row label="push.token_in_db" value={pushDiag.token_in_db} />
        <Row label="push.token_matches_device" value={pushDiag.token_matches_device} />
        <Row label="push.db_notifications_enabled" value={pushDiag.db_notifications_enabled} />
        <Row label="push.project_id_used" value={pushDiag.project_id_used} />
        <Row label="push.last_registered_at" value={pushDiag.last_registered_at} />

        {/* ── Push Test Results (populated after running tests) ── */}
        {pushTest.ranAt !== null && (
          <>
            <Row label="push_test.running" value={pushTest.running} />
            <Row label="push_test.step" value={pushTest.step} />
            <Row label="push_test.ranAt" value={pushTest.ranAt} />
            <Row label="push_test.permission_status" value={pushTest.permission_status} />
            <Row label="push_test.token_present" value={pushTest.token_present} />
            <Row label="push_test.token_saved_to_db" value={pushTest.token_saved_to_db} />
            <Row label="push_test.self.status" value={pushTest.self.status} />
            <Row label="push_test.self.step" value={pushTest.self.step} />
            <Row label="push_test.self.send_status" value={pushTest.self.send_status} />
            <Row label="push_test.self.expo_payload_sent" value={pushTest.self.expo_payload_sent} />
            <Row label="push_test.self.expo_status" value={pushTest.self.expo_status} />
            <Row label="push_test.self.skipped_reason" value={pushTest.self.skipped_reason} />
            <Row label="push_test.self.error" value={pushTest.self.error} />
            <Row label="push_test.self.expo_ticket_id" value={pushTest.self.expo_ticket_id} />
            <Row label="push_test.self.receipt_request_started" value={pushTest.self.receipt_request_started} />
            <Row label="push_test.self.receipt_request_finished" value={pushTest.self.receipt_request_finished} />
            <Row label="push_test.self.receipt_timeout" value={pushTest.self.receipt_timeout} />
            <Row label="push_test.self.receipt_status" value={pushTest.self.receipt_status} />
            <Row label="push_test.self.receipt_details" value={pushTest.self.receipt_details} />
            <Row label="push_test.self.receipt_error" value={pushTest.self.receipt_error} />
            <Row label="push_test.self.receipt_response" value={pushTest.self.receipt_response} />
            <Row label="push_test.partner.token_present" value={pushTest.partner_token_present} />
            <Row label="push_test.partner.enabled" value={pushTest.partner_enabled} />
            <Row label="push_test.partner.status" value={pushTest.partner.status} />
            <Row label="push_test.partner.step" value={pushTest.partner.step} />
            <Row label="push_test.partner.send_status" value={pushTest.partner.send_status} />
            <Row label="push_test.partner.expo_payload_sent" value={pushTest.partner.expo_payload_sent} />
            <Row label="push_test.partner.expo_status" value={pushTest.partner.expo_status} />
            <Row label="push_test.partner.expo_ticket_id" value={pushTest.partner.expo_ticket_id} />
            <Row label="push_test.partner.receipt_request_started" value={pushTest.partner.receipt_request_started} />
            <Row label="push_test.partner.receipt_request_finished" value={pushTest.partner.receipt_request_finished} />
            <Row label="push_test.partner.receipt_timeout" value={pushTest.partner.receipt_timeout} />
            <Row label="push_test.partner.receipt_status" value={pushTest.partner.receipt_status} />
            <Row label="push_test.partner.receipt_details" value={pushTest.partner.receipt_details} />
            <Row label="push_test.partner.receipt_error" value={pushTest.partner.receipt_error} />
            <Row label="push_test.partner.receipt_response" value={pushTest.partner.receipt_response} />
            <Row label="push_test.partner.skipped_reason" value={pushTest.partner.skipped_reason} />
            <Row label="push_test.partner.error" value={pushTest.partner.error} />
            <Row label="push_test.error" value={pushTest.top_error} />
          </>
        )}

        {/* ── 2. Subscription / Pairing State ── */}
        <Section title="Subscription / Pairing State" />
        <Row label="sub.loading" value={subscriptionInfo.loading} />
        <Row label="sub.isPremium" value={subscriptionInfo.isPremium} />
        <Row label="sub.isOnTrial" value={subscriptionInfo.isOnTrial} />
        <Row label="sub.source" value={subscriptionInfo.source} />
        <Row label="sub.plan" value={(subscriptionInfo as any).plan ?? null} />
        <Row label="sub.expiresAt" value={(subscriptionInfo as any).expiresAt ?? null} />
        <Row label="sub.trialExpired" value={subscriptionInfo.trialExpired} />
        <Row label="sub.canInvite" value={(subscriptionInfo as any).canInvite ?? null} />
        <Row label="couple.id" value={couple?.id ?? null} />
        <Row label="couple.active" value={couple?.active ?? null} />
        <Row label="activeCoupleFound" value={activeCoupleFound} />
        <Row label="inactiveCoupleCount" value={inactiveCoupleCount} />
        <Row label="couple.user_a_id" value={couple?.user_a_id ?? null} />
        <Row label="couple.user_b_id" value={couple?.user_b_id ?? null} />
        <Row label="couple.points_enabled" value={couple?.points_enabled ?? null} />
        <Row label="couple.streaks_enabled" value={couple?.streaks_enabled ?? null} />
        <Row label="canRefreshInviteCode" value={canRefreshInviteCode} />
        <Row label="refreshBlockReason" value={refreshBlockReason} />
        <Row label="couple.invite_code" value={couple?.invite_code ?? null} />
        <Row label="couple.subscription_owner_id" value={couple?.subscription_owner_id ?? null} />
        <Row label="rpc_test.status" value={rpcTest.status} />
        <Row label="rpc_test.ranAt" value={rpcTest.ranAt} />
        <Row label="rpc_test.result" value={rpcTest.result !== null ? JSON.stringify(rpcTest.result) : null} />
        <Row label="rpc_test.error.code" value={rpcTest.error?.code ?? null} />
        <Row label="rpc_test.error.message" value={rpcTest.error?.message ?? null} />
        <Row label="rpc_test.error.details" value={rpcTest.error?.details ?? null} />
        <Row label="rpc_test.error.hint" value={rpcTest.error?.hint ?? null} />

        {/* ── 3. Vault Upload Diagnostics ── */}
        <Section title="Vault Upload Diagnostics" />
        <Row label="bucket" value="vault" />
        <Row label="uploadPathTemplate" value={uploadPathTemplate} />
        <Row label="lastPick.at" value={lastVaultPick?.timestamp ?? null} />
        <Row label="lastPick.mimeType" value={(lastVaultPick?.data?.mimeType as string) ?? null} />
        <Row label="lastPick.source" value={(lastVaultPick?.data?.source as string) ?? null} />
        <Row label="lastUploadStart.at" value={lastVaultUploadStart?.timestamp ?? null} />
        <Row label="lastUploadStart.blobSize" value={(lastVaultUploadStart?.data?.blobSize as number) ?? null} />
        <Row label="lastUploadSuccess.at" value={lastVaultUploadSuccess?.timestamp ?? null} />
        <Row label="lastUploadSuccess.path" value={(lastVaultUploadSuccess?.data?.storagePath as string) ?? null} />
        <Row label="lastError.at" value={lastVaultUploadError?.timestamp ?? null} />
        <Row
          label="lastError.reason"
          value={
            (lastVaultUploadError?.data?.reason as string) ??
            (lastVaultUploadError?.data?.supabaseError as string) ??
            (lastVaultUploadError?.data?.error as string) ??
            null
          }
        />
        <Row label="lastError.httpStatus" value={(lastVaultUploadError?.data?.httpStatus as number) ?? null} />
        <Row label="lastError.supabaseMessage" value={(lastVaultUploadError?.data?.supabaseMessage as string) ?? null} />
        <Row label="lastError.supabaseStatusCode" value={(lastVaultUploadError?.data?.supabaseStatusCode as string) ?? null} />

        {/* ── 3b. Wish Upload Diagnostics ── */}
        <Section title="Wish Upload Diagnostics" />
        {(() => {
          const lastPick      = events.find(e => e.tag === 'WISH LAST IMAGE PICK');
          const lastPath      = events.find(e => e.tag === 'WISH LAST UPLOAD PATH');
          const lastErrEv     = events.find(e => e.tag === 'WISH LAST UPLOAD ERROR');
          const lastCreatedId = events.find(e => e.tag === 'WISH LAST CREATED ID');
          return (
            <>
              <Row label="wish_lastImagePickAt"   value={(lastPick?.data?.at as string) ?? null} />
              <Row label="wish_lastImageMime"      value={(lastPick?.data?.mime as string) ?? null} />
              <Row label="wish_lastUploadPath"     value={(lastPath?.data?.path as string) ?? null} />
              <Row label="wish_lastUploadError"    value={(lastErrEv?.data?.error as string | null) ?? null} />
              <Row label="wish_lastCreatedId"      value={(lastCreatedId?.data?.id as string) ?? null} />
            </>
          );
        })()}

        {/* ── 4. Storage / Auth Token State ── */}
        <Section title="Storage / Auth Token State" />
        <Row label="tokenPresent" value={tokenPresent} />
        <Row label="sessionExpiry (ISO)" value={sessionExpiry} />
        <Row label="tokenExpiryCountdown (s)" value={tokenExpiryCountdown} />
        <Row label="supabaseUrlHost" value={supabaseUrlHost} />
        <Row label="dbProjectRef" value={dbProjectRef} />
        <Row label="vaultBucket" value="vault" />

        {/* ── 4b. Environment / Build-time Config ── */}
        <Section title="Environment / Build-time Config" />
        <Row label="SUPABASE_URL (full)" value={process.env.EXPO_PUBLIC_SUPABASE_URL ?? null} />
        <Row label="supabaseKeyLength" value={supabaseKeyLength} />
        <Row label="jwt.parts" value={jwtDecodeDebug.parts} />
        <Row label="jwt.payloadDecodes" value={jwtDecodeDebug.payloadDecodes} />
        <Row label="jwt.role" value={jwtDecodeDebug.role} />
        <Row label="jwt.ref" value={jwtDecodeDebug.ref} />
        <Row label="jwt.iss" value={jwtDecodeDebug.iss} />
        <Row label="jwt.exp" value={jwtDecodeDebug.exp} />
        <Row label="DEBUG_ALWAYS_ON" value={process.env.EXPO_PUBLIC_DEBUG_ALWAYS_ON ?? null} />

        {/* ── 4c. Env vs Client Source + Auth Client Internals ── */}
        {/* sourcesMatch=false → client initialised with wrong values.                   */}
        {/* authClientHasApiKey=false → apikey header missing from auth client headers.  */}
        {/* fetchWrapper=interceptor-v25 → confirms this build has the network logger.   */}
        {/* "No API key found in request" = apikey stripped before reaching Supabase API. */}
        {(() => {
          const diag = getSupabaseDiagnostics() as ReturnType<typeof getSupabaseDiagnostics> & {
            fetchWrapper?: string;
            authClientHasApiKey?: boolean;
            authClientAnonKeyLength?: number;
            authClientUrl?: string;
            authClientHeaderKeys?: string;
          };
          return (
            <>
              <Section title="Env vs Client Source Comparison (V25)" />
              <Row label="env.urlHost"                   value={diag.envUrlHost} />
              <Row label="client.url"                    value={diag.clientUrl} />
              <Row label="env.anonKeyLength"             value={diag.envAnonKeyLength} />
              <Row label="client.anonKeyLength"          value={diag.clientAnonKeyLength} />
              <Row label="env.anonKeyPrefix24"           value={diag.envAnonKeyPrefix24} />
              <Row label="client.anonKeyPrefix24"        value={diag.clientAnonKeyPrefix24} />
              <Row label="env.anonKeyProjectRef"         value={diag.envAnonKeyProjectRefDecoded} />
              <Row label="client.anonKeyProjectRef"      value={diag.clientAnonKeyProjectRefDecoded} />
              <Row label="client.hasAnonKey"             value={diag.clientHasAnonKey} />
              <Row label="sourcesMatch"                  value={diag.sourcesMatch} />
              <Row label="anonKey.rawLength"             value={diag.anonKeyLengthRaw} />
              <Row label="anonKey.trimmedLength"         value={diag.anonKeyLengthTrimmed} />
              <Row label="anonKey.hadWhitespace"         value={diag.anonKeyEndsWithNewline} />
              <Row label="anonKey.rawLastCharsJSON"      value={diag.anonKeyRawLastCharsJSON} />
              <Row label="fetchWrapper"                  value={diag.fetchWrapper ?? 'unknown'} />
              <Section title="Auth Client Internals (V25)" />
              <Row label="authClientSource"              value="supabase.auth (shared lib/supabase.ts)" />
              <Row label="authClientUrl"                 value={diag.authClientUrl} />
              <Row label="authClientHasApiKey"           value={diag.authClientHasApiKey} />
              <Row label="authClientAnonKeyLength"       value={diag.authClientAnonKeyLength} />
              <Row label="authClientHeaderKeys"          value={diag.authClientHeaderKeys} />
            </>
          );
        })()}

        {/* ── 4d. Login Attempt Debug ── */}
        {/* Reloads on every screen focus via useFocusEffect — always shows latest attempt. */}
        {(() => {
          let a: Record<string, unknown> | null = null;
          try { if (lastLoginAttempt) a = JSON.parse(lastLoginAttempt); } catch {}
          let e: Record<string, unknown> | null = null;
          try { if (authLastError) e = JSON.parse(authLastError); } catch {}
          const aStr = (k: string) => { const v = a?.[k]; return v == null ? null : String(v); };
          const eStr = (k: string) => { const v = e?.[k]; return v == null ? null : String(v); };
          return (
            <>
              <Section title="Login Attempt Debug (reloads on focus)" />
              <Row label="auth_last_attempt_at"        value={aStr('attemptAt') ?? '(no attempt recorded)'} />
              <Row label="auth_last_email"             value={aStr('email')} />
              <Row label="auth_last_method"            value={aStr('method')} />
              <Row label="auth_last_client_source"     value={aStr('clientSource')} />
              <Row label="auth_last_client_url"        value={aStr('clientUrl')} />
              <Row label="auth_last_has_anon_key"      value={aStr('hasAnonKey')} />
              <Row label="auth_last_anon_key_length"   value={aStr('anonKeyLength')} />
              <Row label="auth_last_header_keys"       value={aStr('authHeaderKeys')} />
              <Row label="auth_last_error_message"     value={eStr('message') ?? '(none)'} />
              <Row label="auth_last_error_status"      value={eStr('status')} />
              <Row label="auth_last_error_code"        value={eStr('code')} />
              <Row label="auth_last_error_name"        value={eStr('name')} />
              <Row label="auth_last_error_full_json"   value={authLastError ?? '(none)'} />
            </>
          );
        })()}

        {/* ── 4e. Auth Last Error (legacy full blob) ── */}
        {(() => {
          let parsed: Record<string, unknown> | null = null;
          try { if (authLastError) parsed = JSON.parse(authLastError); } catch {}
          const str = (key: string) => {
            const v = parsed?.[key];
            return v == null ? null : String(v);
          };
          const clientDiag = parsed?.clientDiag as Record<string, unknown> | undefined;
          return (
            <>
              <Section title="Auth Last Error (detail)" />
              <Row label="authLastErrorMessage"     value={str('message') ?? '(none recorded)'} />
              <Row label="authLastErrorStatus"      value={str('status')} />
              <Row label="authLastErrorCode"        value={str('code')} />
              <Row label="authLastErrorName"        value={str('name')} />
              <Row label="authLastErrorHttpBody"    value={str('httpBody')} />
              <Row label="authLastError.clientDiag.clientHasAnonKey"    value={clientDiag ? String(clientDiag.clientHasAnonKey ?? 'n/a') : null} />
              <Row label="authLastError.clientDiag.sourcesMatch"        value={clientDiag ? String(clientDiag.sourcesMatch ?? 'n/a') : null} />
              <Row label="authLastErrorFullJson"    value={authLastError ?? '(none recorded)'} />
            </>
          );
        })()}

        {/* ── 4f. Auth Session Live Probe ── */}
        {/* Auto-runs on every screen focus. Tap button to re-run manually. */}
        <Section title="Auth Session Live Probe" />
        <TouchableOpacity
          onPress={runAuthProbe}
          style={styles.probeButton}
          activeOpacity={0.75}
        >
          <AppText style={styles.probeButtonText}>Run Auth Session Probe</AppText>
        </TouchableOpacity>
        <Row label="probe_ran_at"                        value={authProbe.ranAt ?? '(not yet run)'} />
        <Row label="auth_storage_adapter"                value={authProbe.auth_storage_adapter} />
        <Row label="auth_storage_keys_found"             value={authProbe.auth_storage_keys_found} />
        <Row label="auth_storage_session_key_exists"     value={authProbe.auth_storage_session_key_exists} />
        <Row label="auth_storage_session_raw_length"     value={authProbe.auth_storage_session_raw_length} />
        <Row label="auth_storage_session_parse_ok"       value={authProbe.auth_storage_session_parse_ok} />
        <Row label="auth_storage_session_user_id"        value={authProbe.auth_storage_session_user_id} />
        <Row label="auth_storage_session_expires_at"     value={authProbe.auth_storage_session_expires_at} />
        <Row label="auth_getSession_ran_at"              value={authProbe.auth_getSession_ran_at} />
        <Row label="auth_getSession_has_session"         value={authProbe.auth_getSession_has_session} />
        <Row label="auth_getSession_user_id"             value={authProbe.auth_getSession_user_id} />
        <Row label="auth_getSession_error_message"       value={authProbe.auth_getSession_error_message ?? '(none)'} />
        <Row label="auth_getUser_ran_at"                 value={authProbe.auth_getUser_ran_at} />
        <Row label="auth_getUser_has_user"               value={authProbe.auth_getUser_has_user} />
        <Row label="auth_getUser_user_id"                value={authProbe.auth_getUser_user_id} />
        <Row label="auth_getUser_error_message"          value={authProbe.auth_getUser_error_message ?? '(none)'} />
        <Row label="last_auth_event"                     value={authProbe.last_auth_event ?? '(none since screen mount)'} />
        <Row label="last_auth_event_at"                  value={authProbe.last_auth_event_at ?? '(none)'} />
        <Row label="auth_client_source"                  value={authProbe.auth_client_source} />
        <Row label="auth_last_attempt_at"                value={authProbe.persisted_attempt_at ?? '(none recorded)'} />
        <Row label="auth_last_error_message"             value={authProbe.persisted_error_message ?? '(none recorded)'} />
        <Row label="auth_last_error_status"              value={authProbe.persisted_error_status ?? '(none recorded)'} />
        <Row label="auth_last_error_code"                value={authProbe.persisted_error_code ?? '(none recorded)'} />
        <Row label="auth_last_error_full_json"           value={authProbe.persisted_error_full_json ?? '(none recorded)'} />
        <Row label="auth_last_signin_success"                  value={authProbe.auth_last_signin_success ?? '(none recorded)'} />
        <Row label="auth_last_signin_user_id"                  value={authProbe.auth_last_signin_user_id ?? '(none recorded)'} />
        <Row label="auth_last_signin_session_present"          value={authProbe.auth_last_signin_session_present ?? '(none recorded)'} />
        <Row label="auth_last_signin_access_token_present"     value={authProbe.auth_last_signin_access_token_present ?? '(none recorded)'} />
        <Row label="auth_last_signin_refresh_token_present"    value={authProbe.auth_last_signin_refresh_token_present ?? '(none recorded)'} />
        <Row label="auth_after_signin_getSession_has_session"  value={authProbe.auth_after_signin_getSession_has_session ?? '(none recorded)'} />
        <Row label="auth_after_signin_getSession_user_id"      value={authProbe.auth_after_signin_getSession_user_id ?? '(none recorded)'} />
        <Row label="auth_after_signin_storage_keys_found"      value={authProbe.auth_after_signin_storage_keys_found ?? '(none recorded)'} />
        <Row label="auth_after_signin_session_key_exists"      value={authProbe.auth_after_signin_session_key_exists ?? '(none recorded)'} />
        <Row label="auth_after_signin_session_raw_length"      value={authProbe.auth_after_signin_session_raw_length ?? '(none recorded)'} />
        <Row label="auth_after_signin_session_parse_ok"        value={authProbe.auth_after_signin_session_parse_ok ?? '(none recorded)'} />
        <Row label="auth_session_cleared_at"                   value={authProbe.auth_session_cleared_at ?? '(none recorded)'} />
        <Row label="auth_session_cleared_reason"               value={authProbe.auth_session_cleared_reason ?? '(none recorded)'} />

        <Section title="Login Button Preflight (login.tsx / unlock.tsx)" />
        <Row label="login_button_pressed_at"                   value={authProbe.login_button_pressed_at ?? '(none recorded)'} />
        <Row label="login_handler_file"                        value={authProbe.login_handler_file ?? '(none recorded)'} />
        <Row label="login_handler_name"                        value={authProbe.login_handler_name ?? '(none recorded)'} />
        <Row label="login_reached_preflight"                   value={authProbe.login_reached_preflight ?? '(none recorded)'} />
        <Row label="login_reached_signInWithPassword"          value={authProbe.login_reached_signInWithPassword ?? '(none recorded)'} />
        <Row label="login_preflight_has_supabase_client"       value={authProbe.login_preflight_has_supabase_client ?? '(none recorded)'} />
        <Row label="login_preflight_has_anon_key"              value={authProbe.login_preflight_has_anon_key ?? '(none recorded)'} />
        <Row label="login_preflight_anon_key_length"           value={authProbe.login_preflight_anon_key_length ?? '(none recorded)'} />
        <Row label="login_error_source"                        value={authProbe.login_error_source ?? '(none recorded)'} />
        <Row label="login_visible_error_message"               value={authProbe.login_visible_error_message ?? '(none recorded)'} />
        <Row label="login_error_name"                          value={authProbe.login_error_name ?? '(none recorded)'} />
        <Row label="login_error_message"                       value={authProbe.login_error_message ?? '(none recorded)'} />
        <Row label="login_error_status"                        value={authProbe.login_error_status ?? '(none recorded)'} />
        <Row label="login_error_code"                          value={authProbe.login_error_code ?? '(none recorded)'} />
        <Row label="login_error_stack"                         value={authProbe.login_error_stack ?? '(none recorded)'} />
        <Row label="login_error_full_json"                     value={authProbe.login_error_full_json ?? '(none recorded)'} />

        <Section title="Network Probes (run after login error)" />
        <Row label="network_supabase_root_ok"                  value={authProbe.network_supabase_root_ok ?? '(not run yet)'} />
        <Row label="network_supabase_root_status"              value={authProbe.network_supabase_root_status ?? '(not run yet)'} />
        <Row label="network_supabase_auth_health_ok"           value={authProbe.network_supabase_auth_health_ok ?? '(not run yet)'} />
        <Row label="network_supabase_auth_health_status"       value={authProbe.network_supabase_auth_health_status ?? '(not run yet)'} />
        <Row label="network_supabase_auth_health_error"        value={authProbe.network_supabase_auth_health_error ?? '(not run yet)'} />
        <Row label="network_raw_fetch_with_key_ok"             value={authProbe.network_raw_fetch_with_key_ok ?? '(not run yet)'} />
        <Row label="network_raw_fetch_with_key_status"         value={authProbe.network_raw_fetch_with_key_status ?? '(not run yet)'} />
        <Row label="network_raw_fetch_with_key_error"          value={authProbe.network_raw_fetch_with_key_error ?? '(not run yet)'} />
        <Row label="network_raw_auth_with_key_ok"              value={authProbe.network_raw_auth_with_key_ok ?? '(not run yet)'} />
        <Row label="network_raw_auth_with_key_status"          value={authProbe.network_raw_auth_with_key_status ?? '(not run yet)'} />
        <Row label="network_raw_auth_with_key_error"           value={authProbe.network_raw_auth_with_key_error ?? '(not run yet)'} />
        <Row label="v37_req_headers_entries"                   value={authProbe.v37_req_headers_entries ?? '(not run yet)'} />
        <Row label="v37_req_fetch_status"                      value={authProbe.v37_req_fetch_status ?? '(not run yet)'} />
        <Row label="v37_req_fetch_ok"                          value={authProbe.v37_req_fetch_ok ?? '(not run yet)'} />
        <Row label="v37_req_fetch_body"                        value={authProbe.v37_req_fetch_body ?? '(not run yet)'} />
        <Row label="v38_ran_at"                                value={authProbe.v38_ran_at ?? '(not run yet)'} />
        <Row label="v38_req_headers_entries"                   value={authProbe.v38_req_headers_entries ?? '(not run yet)'} />
        <Row label="v38_req_has_apikey"                        value={authProbe.v38_req_has_apikey ?? '(not run yet)'} />
        <Row label="v38_req_has_authorization"                 value={authProbe.v38_req_has_authorization ?? '(not run yet)'} />
        <Row label="v38_req_fetch_status"                      value={authProbe.v38_req_fetch_status ?? '(not run yet)'} />
        <Row label="v38_req_fetch_body"                        value={authProbe.v38_req_fetch_body ?? '(not run yet)'} />
        <Row label="v38_url_param_fetch_status"                value={authProbe.v38_url_param_fetch_status ?? '(not run yet)'} />
        <Row label="v38_url_param_fetch_body"                  value={authProbe.v38_url_param_fetch_body ?? '(not run yet)'} />

        {/* ── 5. EAS / OTA Runtime Info ── */}
        <Section title="EAS / OTA Runtime Info (legacy top-level)" />
        <Row label="updateId" value={updateId} />
        <Row label="runtimeVersion" value={runtimeVersion} />
        <Row label="channel" value={channel} />
        <Row label="isEmbeddedLaunch (legacy)" value={isEmbeddedLaunch} />
        <Row label="isEmergencyLaunch (legacy)" value={isEmergencyLaunch} />
        <Row label="createdAt (legacy)" value={createdAt} />
        <Row label="launchDuration (ms)" value={launchDuration} />

        <Section title="currentlyRunning (SDK 52 authoritative)" />
        <Row label="cr.isEmbeddedLaunch" value={cr_isEmbeddedLaunch} />
        <Row label="cr.updateId" value={cr_updateId} />
        <Row label="cr.channel" value={cr_channel} />
        <Row label="cr.runtimeVersion" value={cr_runtimeVersion} />
        <Row label="cr.createdAt" value={cr_createdAt} />
        <Row label="cr.isEmergencyLaunch" value={cr_isEmergencyLaunch} />
        <Row label="cr.manifest.id" value={cr_manifestId} />
        <Row label="requestHeaders" value={(() => { try { const h = (Updates as any).requestHeaders; return h ? JSON.stringify(h) : null; } catch { return null; } })()} />

        <Section title="App / Build Info" />
        <Row label="appVersion (app.json)" value={appVersion} />
        <Row label="nativeAppVersion" value={nativeVersion} />
        <Row label="nativeBuildVersion" value={buildVersion} />
        <Row label="currentRoute" value={pathname} />
        <Row label="manifest.extra" value={updatesManifestExtra} />
        <Row label="manifest.metadata" value={updatesManifestMetadata} />
        <Row label="checkForUpdateUrl" value={updatesCheckForUpdateUrl} />
        <Row label="expoConfig.projectId" value={Constants.default?.expoConfig?.extra?.eas?.projectId ?? null} />
        <Row label="easConfig.projectId" value={(Constants.default as any)?.easConfig?.projectId ?? null} />
        <Row label="updates.url (config)" value={(Constants.default?.expoConfig as any)?.updates?.url ?? null} />
        <Row label="runtimeVersion (config)" value={(Constants.default?.expoConfig as any)?.runtimeVersion ?? null} />

        {/* ── 6. Recent Debug Events ── */}
        <Section title="Recent Debug Events" />
        <View style={styles.eventsHeader}>
          <AppText style={styles.eventsCount}>{events.length} event{events.length !== 1 ? 's' : ''}</AppText>
          <TouchableOpacity
            onPress={() => { clearDebugEvents(); setEvents([]); }}
            style={styles.clearEventsBtn}
            activeOpacity={0.7}
            hitSlop={8}
          >
            <RefreshCw size={12} color="#777" />
            <AppText style={styles.clearEventsBtnText}>Clear</AppText>
          </TouchableOpacity>
        </View>
        {events.length === 0 ? (
          <View style={styles.emptyEvents}>
            <AppText style={styles.emptyEventsText}>No events yet — trigger a vault upload to see logs here.</AppText>
          </View>
        ) : (
          events.slice(0, 30).map((ev, i) => <EventRow key={i} event={ev} />)
        )}

        {/* ── Action Buttons ── */}
        <View style={styles.buttonArea}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.actionBtnDanger, clearing && styles.btnDisabled]}
            onPress={handleClearLocalState}
            disabled={clearing}
            activeOpacity={0.8}
          >
            <Trash2 size={15} color="#fff" />
            <AppText style={styles.actionBtnLabel}>
              {clearing ? 'Clearing…' : 'Clear Local Device State'}
            </AppText>
          </TouchableOpacity>
          <AppText style={styles.btnNote}>
            Deletes PIN, unlock timer, and weather cache. Stays logged in.
          </AppText>

          <TouchableOpacity
            style={[styles.actionBtn, styles.actionBtnDanger, loggingOut && styles.btnDisabled]}
            onPress={handleForceLogout}
            disabled={loggingOut}
            activeOpacity={0.8}
          >
            <LogOut size={15} color="#fff" />
            <AppText style={styles.actionBtnLabel}>
              {loggingOut ? 'Logging out…' : 'Force Logout'}
            </AppText>
          </TouchableOpacity>
          <AppText style={styles.btnNote}>
            Signs out of Supabase and returns to welcome screen.
          </AppText>

          <TouchableOpacity
            style={[styles.actionBtn, styles.actionBtnWarn, resetting && styles.btnDisabled]}
            onPress={handleResetSecurity}
            disabled={resetting}
            activeOpacity={0.8}
          >
            <Shield size={15} color="#fff" />
            <AppText style={styles.actionBtnLabel}>
              {resetting ? 'Resetting…' : 'Reset Security Settings'}
            </AppText>
          </TouchableOpacity>
          <AppText style={styles.btnNote}>
            Sets login_method=password, disables stealth mode, clears lock timer in DB.
          </AppText>

          {/* ── Push Test Buttons ── */}
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: '#1a1a2e' }, (reRegisterStatus === 'running' || Platform.OS === 'web' || !userId) && styles.btnDisabled]}
            onPress={handleReRegisterToken}
            disabled={reRegisterStatus === 'running' || Platform.OS === 'web' || !userId}
            activeOpacity={0.8}
          >
            {reRegisterStatus === 'running'
              ? <ActivityIndicator size="small" color="#A569BD" />
              : <RefreshCw size={15} color="#A569BD" />
            }
            <AppText style={[styles.actionBtnLabel, { color: '#A569BD' }]}>
              {reRegisterStatus === 'running' ? 'Re-registering…'
                : reRegisterStatus === 'done' ? 'Token Re-registered'
                : reRegisterStatus === 'error' ? 'Re-register Failed (check permission)'
                : 'A. Re-register Push Token'}
            </AppText>
          </TouchableOpacity>
          <AppText style={styles.btnNote}>
            Fetches a fresh Expo push token from APNs and saves it to the database. Fixes stale or missing tokens without toggling Settings.
          </AppText>

          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: '#1a2a1a' }, (localTestSent === 'sending' || Platform.OS === 'web') && styles.btnDisabled]}
            onPress={handleLocalTestNotification}
            disabled={localTestSent === 'sending' || Platform.OS === 'web'}
            activeOpacity={0.8}
          >
            {localTestSent === 'sending'
              ? <ActivityIndicator size="small" color="#82E0AA" />
              : <RefreshCw size={15} color="#82E0AA" />
            }
            <AppText style={[styles.actionBtnLabel, { color: '#82E0AA' }]}>
              {localTestSent === 'sending' ? 'Scheduling…'
                : localTestSent === 'sent' ? 'Local Notification Sent'
                : localTestSent === 'error' ? 'Local Notification Failed'
                : 'B. Local Test Notification'}
            </AppText>
          </TouchableOpacity>
          <AppText style={styles.btnNote}>
            Schedules a notification to appear in 1 second. Proves permission + in-app handler. No server involved.
          </AppText>

          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: '#0d2233' }, (pushTest.running || Platform.OS === 'web' || !couple?.id) && styles.btnDisabled]}
            onPress={() => handleTestPush(false)}
            disabled={pushTest.running || Platform.OS === 'web' || !couple?.id}
            activeOpacity={0.8}
          >
            {pushTest.running && pushTest.self.status === 'loading'
              ? <ActivityIndicator size="small" color="#5DADE2" />
              : <RefreshCw size={15} color="#5DADE2" />
            }
            <AppText style={[styles.actionBtnLabel, { color: '#5DADE2' }]}>
              {pushTest.running ? 'Running push tests…' : 'C. End-to-End Push Test (Self + Partner)'}
            </AppText>
          </TouchableOpacity>
          <AppText style={styles.btnNote}>
            Re-registers token, saves to DB, then sends via Expo push server to both self and partner.
          </AppText>

          {pushTest.running && (
            <View style={[styles.rpcCard, styles.rpcCardLoading]}>
              <AppText style={[styles.rpcCardStatus, { color: '#FFA040' }]}>
                {pushTest.self.status === 'loading' ? 'Sending self push…'
                  : pushTest.partner.status === 'loading' ? 'Sending partner push…'
                  : 'Running…'}
              </AppText>
            </View>
          )}

          {!pushTest.running && pushTest.ranAt !== null && (() => {
            const selfReceiptOk = pushTest.self.receipt_status === 'ok';
            const selfReceiptErr = pushTest.self.receipt_status === 'error' || (pushTest.self.receipt_error ?? '') !== '';
            const selfTicketOk = pushTest.self.expo_status === 'ok';
            const partnerReceiptOk = pushTest.partner.receipt_status === 'ok';
            const partnerReceiptErr = pushTest.partner.receipt_status === 'error' || (pushTest.partner.receipt_error ?? '') !== '';
            const partnerTicketOk = pushTest.partner.expo_status === 'ok';
            const anyReceiptOk = selfReceiptOk || partnerReceiptOk;
            const anyReceiptErr = selfReceiptErr || partnerReceiptErr;
            const cardStyle = pushTest.top_error || anyReceiptErr
              ? styles.rpcCardError
              : anyReceiptOk
                ? { backgroundColor: '#0d1f2b', borderColor: '#1a4a6a' }
                : { backgroundColor: '#2b2b0d', borderColor: '#6a6a1a' };
            const cardColor = pushTest.top_error || anyReceiptErr ? '#FF6B6B' : anyReceiptOk ? '#5DADE2' : '#FFA040';
            return (
            <View style={[styles.rpcCard, cardStyle]}>
              <View style={styles.rpcCardHeader}>
                <AppText style={[styles.rpcCardStatus, { color: cardColor }]}>
                  PUSH TEST — {pushTest.top_error || anyReceiptErr ? 'ERROR' : anyReceiptOk ? 'DELIVERED' : 'PENDING'}
                </AppText>
                <AppText style={styles.rpcCardTs} selectable>{pushTest.ranAt?.substring(11, 19)}</AppText>
              </View>
              {([
                ['permission', pushTest.permission_status],
                ['token_present', pushTest.token_present],
                ['token_saved_to_db', pushTest.token_saved_to_db],
                ['self.send_status', pushTest.self.send_status],
                ['self.expo_ticket_status', pushTest.self.expo_status],
                ['self.expo_ticket_id', pushTest.self.expo_ticket_id],
                ['self.expo_receipt_status', pushTest.self.receipt_status],
                ['self.expo_receipt_error', pushTest.self.receipt_error],
                ['self.expo_receipt_details', pushTest.self.receipt_details],
                ['self.expo_receipt_timeout', pushTest.self.receipt_timeout],
                ['self.expo_payload_sent', pushTest.self.expo_payload_sent],
                ['self.skipped', pushTest.self.skipped_reason],
                ['self.error', pushTest.self.error],
                ['partner.token_present', pushTest.partner_token_present],
                ['partner.enabled', pushTest.partner_enabled],
                ['partner.send_status', pushTest.partner.send_status],
                ['partner.expo_ticket_status', pushTest.partner.expo_status],
                ['partner.expo_ticket_id', pushTest.partner.expo_ticket_id],
                ['partner.expo_receipt_status', pushTest.partner.receipt_status],
                ['partner.expo_receipt_error', pushTest.partner.receipt_error],
                ['partner.expo_receipt_details', pushTest.partner.receipt_details],
                ['partner.expo_receipt_timeout', pushTest.partner.receipt_timeout],
                ['partner.expo_payload_sent', pushTest.partner.expo_payload_sent],
                ['partner.skipped', pushTest.partner.skipped_reason],
                ['partner.error', pushTest.partner.error],
                ['top_error', pushTest.top_error],
              ] as [string, string | number | boolean | null][]).filter(([, v]) => v !== null && v !== '').map(([label, value]) => {
                const isError = value === false || (typeof value === 'string' && (value.includes('error') || value.includes('Error') || value === 'DeviceNotRegistered' || value === 'InvalidCredentials'));
                const isOk = typeof value === 'string' && (value === 'ok' || value === '200');
                return (
                <View key={label} style={styles.rpcCardField}>
                  <AppText style={styles.rpcCardFieldLabel}>{label}</AppText>
                  <AppText style={[styles.rpcCardFieldValue, isError ? { color: '#FF6B6B' } : isOk ? { color: '#5DADE2' } : {}]} selectable>
                    {String(value)}
                  </AppText>
                </View>
                );
              })}
            </View>
            );
          })()}

          {profile?.is_super_admin === true && (
            <>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: '#2a0d1a', borderWidth: 1, borderColor: '#6a2d3a' }, (pushTest.running || Platform.OS === 'web' || !couple?.id) && styles.btnDisabled]}
                onPress={() => handleTestPush(true)}
                disabled={pushTest.running || Platform.OS === 'web' || !couple?.id}
                activeOpacity={0.8}
              >
                {pushTest.running
                  ? <ActivityIndicator size="small" color="#F1948A" />
                  : <Shield size={15} color="#F1948A" />
                }
                <AppText style={[styles.actionBtnLabel, { color: '#F1948A' }]}>
                  Force Partner Test Push (Admin Override)
                </AppText>
              </TouchableOpacity>
              <AppText style={styles.btnNote}>
                Bypasses partner push_notifications_enabled. Super-admin only.
              </AppText>
            </>
          )}

          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: '#1a3a1a' }, rpcTest.status === 'loading' && styles.btnDisabled]}
            onPress={handleTestRpc}
            disabled={rpcTest.status === 'loading'}
            activeOpacity={0.8}
          >
            {rpcTest.status === 'loading'
              ? <ActivityIndicator size="small" color="#4CAF50" />
              : <RefreshCw size={15} color="#4CAF50" />
            }
            <AppText style={[styles.actionBtnLabel, { color: '#4CAF50' }]}>
              {rpcTest.status === 'loading' ? 'Testing RPC…' : 'Test generate_invite_code RPC'}
            </AppText>
          </TouchableOpacity>

          {/* Inline result card — always visible after first run */}
          {rpcTest.status !== 'idle' && (
            <View style={[
              styles.rpcCard,
              rpcTest.status === 'loading' && styles.rpcCardLoading,
              rpcTest.status === 'success' && styles.rpcCardSuccess,
              (rpcTest.status === 'error' || rpcTest.status === 'timeout') && styles.rpcCardError,
            ]}>
              <View style={styles.rpcCardHeader}>
                <AppText style={[
                  styles.rpcCardStatus,
                  rpcTest.status === 'success' && { color: '#4CAF50' },
                  (rpcTest.status === 'error' || rpcTest.status === 'timeout') && { color: '#FF6B6B' },
                  rpcTest.status === 'loading' && { color: '#FFA040' },
                ]}>
                  {rpcTest.status.toUpperCase()}
                </AppText>
                {rpcTest.ranAt && (
                  <AppText style={styles.rpcCardTs} selectable>{rpcTest.ranAt}</AppText>
                )}
              </View>

              {rpcTest.status === 'success' && rpcTest.result !== null && (
                <View style={styles.rpcCardField}>
                  <AppText style={styles.rpcCardFieldLabel}>result</AppText>
                  <AppText style={styles.rpcCardFieldValue} selectable numberOfLines={0}>
                    {JSON.stringify(rpcTest.result, null, 2)}
                  </AppText>
                </View>
              )}

              {(rpcTest.status === 'error' || rpcTest.status === 'timeout') && rpcTest.error && (
                <>
                  {rpcTest.error.code && (
                    <View style={styles.rpcCardField}>
                      <AppText style={styles.rpcCardFieldLabel}>code</AppText>
                      <AppText style={styles.rpcCardFieldValue} selectable>{rpcTest.error.code}</AppText>
                    </View>
                  )}
                  {rpcTest.error.message && (
                    <View style={styles.rpcCardField}>
                      <AppText style={styles.rpcCardFieldLabel}>message</AppText>
                      <AppText style={styles.rpcCardFieldValue} selectable numberOfLines={0}>{rpcTest.error.message}</AppText>
                    </View>
                  )}
                  {rpcTest.error.details && (
                    <View style={styles.rpcCardField}>
                      <AppText style={styles.rpcCardFieldLabel}>details</AppText>
                      <AppText style={styles.rpcCardFieldValue} selectable numberOfLines={0}>{rpcTest.error.details}</AppText>
                    </View>
                  )}
                  {rpcTest.error.hint && (
                    <View style={styles.rpcCardField}>
                      <AppText style={styles.rpcCardFieldLabel}>hint</AppText>
                      <AppText style={styles.rpcCardFieldValue} selectable numberOfLines={0}>{rpcTest.error.hint}</AppText>
                    </View>
                  )}
                </>
              )}
            </View>
          )}

          <AppText style={styles.btnNote}>
            Calls generate_invite_code() RPC. Result appears immediately above.
          </AppText>

          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: '#0d2233' }, dbIdentity.status === 'loading' && styles.btnDisabled]}
            onPress={handleTestDbIdentity}
            disabled={dbIdentity.status === 'loading'}
            activeOpacity={0.8}
          >
            {dbIdentity.status === 'loading'
              ? <ActivityIndicator size="small" color="#60C8FF" />
              : <Shield size={15} color="#60C8FF" />
            }
            <AppText style={[styles.actionBtnLabel, { color: '#60C8FF' }]}>
              {dbIdentity.status === 'loading' ? 'Checking DB…' : 'Test DB Identity RPC'}
            </AppText>
          </TouchableOpacity>

          {dbIdentity.status !== 'idle' && (
            <View style={[
              styles.rpcCard,
              dbIdentity.status === 'loading' && styles.rpcCardLoading,
              dbIdentity.status === 'success' && { backgroundColor: '#0d1f2b', borderColor: '#1a4a6a' },
              dbIdentity.status === 'error' && styles.rpcCardError,
            ]}>
              <View style={styles.rpcCardHeader}>
                <AppText style={[
                  styles.rpcCardStatus,
                  dbIdentity.status === 'success' && { color: '#60C8FF' },
                  dbIdentity.status === 'error' && { color: '#FF6B6B' },
                  dbIdentity.status === 'loading' && { color: '#FFA040' },
                ]}>
                  DB IDENTITY — {dbIdentity.status.toUpperCase()}
                </AppText>
                {dbIdentity.ranAt && (
                  <AppText style={styles.rpcCardTs} selectable>{dbIdentity.ranAt.substring(11, 19)}</AppText>
                )}
              </View>

              {dbIdentity.status === 'success' && dbIdentity.result !== null && (
                Object.entries(dbIdentity.result as Record<string, any>).map(([k, v]) => (
                  <View key={k} style={styles.rpcCardField}>
                    <AppText style={styles.rpcCardFieldLabel}>{k}</AppText>
                    <AppText style={styles.rpcCardFieldValue} selectable>{String(v)}</AppText>
                  </View>
                ))
              )}

              {dbIdentity.status === 'error' && dbIdentity.error && (
                <>
                  {dbIdentity.error.code && (
                    <View style={styles.rpcCardField}>
                      <AppText style={styles.rpcCardFieldLabel}>code</AppText>
                      <AppText style={styles.rpcCardFieldValue} selectable>{dbIdentity.error.code}</AppText>
                    </View>
                  )}
                  {dbIdentity.error.message && (
                    <View style={styles.rpcCardField}>
                      <AppText style={styles.rpcCardFieldLabel}>message</AppText>
                      <AppText style={styles.rpcCardFieldValue} selectable numberOfLines={0}>{dbIdentity.error.message}</AppText>
                    </View>
                  )}
                </>
              )}
            </View>
          )}

          <AppText style={styles.btnNote}>
            Confirms which Supabase project the app is connected to.
          </AppText>

          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: '#0d1a2b' }, checkUpdate.status === 'loading' && styles.btnDisabled]}
            onPress={handleCheckUpdate}
            disabled={checkUpdate.status === 'loading'}
            activeOpacity={0.8}
          >
            {checkUpdate.status === 'loading'
              ? <ActivityIndicator size="small" color="#60C8FF" />
              : <RefreshCw size={15} color="#60C8FF" />
            }
            <AppText style={[styles.actionBtnLabel, { color: '#60C8FF' }]}>
              {checkUpdate.status === 'loading' ? 'Checking for update…' : 'checkForUpdateAsync()'}
            </AppText>
          </TouchableOpacity>

          {checkUpdate.status !== 'idle' && (
            <View style={[
              styles.rpcCard,
              checkUpdate.status === 'loading' && styles.rpcCardLoading,
              checkUpdate.status === 'success' && (checkUpdate.isAvailable ? styles.rpcCardSuccess : { backgroundColor: '#0d2b0d', borderColor: '#2d6a2d' }),
              checkUpdate.status === 'error' && styles.rpcCardError,
            ]}>
              <View style={styles.rpcCardHeader}>
                <AppText style={[
                  styles.rpcCardStatus,
                  checkUpdate.status === 'success' && { color: checkUpdate.isAvailable ? '#FFA040' : '#4CAF50' },
                  checkUpdate.status === 'error' && { color: '#FF6B6B' },
                  checkUpdate.status === 'loading' && { color: '#FFA040' },
                ]}>
                  {checkUpdate.status === 'success'
                    ? (checkUpdate.isAvailable ? 'UPDATE AVAILABLE' : 'UP TO DATE')
                    : checkUpdate.status.toUpperCase()}
                </AppText>
                {checkUpdate.ranAt && (
                  <AppText style={styles.rpcCardTs} selectable>{checkUpdate.ranAt.substring(11, 19)}</AppText>
                )}
              </View>
              {checkUpdate.status === 'success' && checkUpdate.manifest && (
                <View style={styles.rpcCardField}>
                  <AppText style={styles.rpcCardFieldLabel}>manifest</AppText>
                  <AppText style={styles.rpcCardFieldValue} selectable numberOfLines={0}>{checkUpdate.manifest}</AppText>
                </View>
              )}
              {checkUpdate.status === 'error' && checkUpdate.error && (
                <View style={styles.rpcCardField}>
                  <AppText style={styles.rpcCardFieldLabel}>error</AppText>
                  <AppText style={styles.rpcCardFieldValue} selectable numberOfLines={0}>{checkUpdate.error}</AppText>
                </View>
              )}
            </View>
          )}
          <AppText style={styles.btnNote}>
            Calls Updates.checkForUpdateAsync() — shows whether a newer OTA is available.
          </AppText>

          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: '#0d2b1a' }, (applyUpdate.status === 'checking' || applyUpdate.status === 'fetching' || applyUpdate.status === 'reloading') && styles.btnDisabled]}
            onPress={handleFetchAndApplyUpdate}
            disabled={applyUpdate.status === 'checking' || applyUpdate.status === 'fetching' || applyUpdate.status === 'reloading'}
            activeOpacity={0.8}
          >
            {(applyUpdate.status === 'checking' || applyUpdate.status === 'fetching' || applyUpdate.status === 'reloading')
              ? <ActivityIndicator size="small" color="#4CAF50" />
              : <RefreshCw size={15} color="#4CAF50" />
            }
            <AppText style={[styles.actionBtnLabel, { color: '#4CAF50' }]}>
              {applyUpdate.status === 'checking' ? 'Checking…'
                : applyUpdate.status === 'fetching' ? 'Downloading update…'
                : applyUpdate.status === 'reloading' ? 'Reloading app…'
                : 'Fetch + Apply OTA Update'}
            </AppText>
          </TouchableOpacity>

          {applyUpdate.status !== 'idle' && (
            <View style={[
              styles.rpcCard,
              (applyUpdate.status === 'checking' || applyUpdate.status === 'fetching' || applyUpdate.status === 'reloading') && styles.rpcCardLoading,
              applyUpdate.status === 'no-update' && { backgroundColor: '#0d2b0d', borderColor: '#2d6a2d' },
              applyUpdate.status === 'error' && styles.rpcCardError,
            ]}>
              <View style={styles.rpcCardHeader}>
                <AppText style={[
                  styles.rpcCardStatus,
                  applyUpdate.status === 'no-update' && { color: '#4CAF50' },
                  applyUpdate.status === 'error' && { color: '#FF6B6B' },
                  (applyUpdate.status === 'checking' || applyUpdate.status === 'fetching' || applyUpdate.status === 'reloading') && { color: '#FFA040' },
                ]}>
                  {applyUpdate.status === 'no-update' ? 'UP TO DATE'
                    : applyUpdate.status === 'reloading' ? 'RELOADING…'
                    : applyUpdate.status.toUpperCase()}
                </AppText>
                {applyUpdate.ranAt && (
                  <AppText style={styles.rpcCardTs} selectable>{applyUpdate.ranAt.substring(11, 19)}</AppText>
                )}
              </View>
              {applyUpdate.status === 'error' && applyUpdate.error && (
                <View style={styles.rpcCardField}>
                  <AppText style={styles.rpcCardFieldLabel}>error</AppText>
                  <AppText style={styles.rpcCardFieldValue} selectable numberOfLines={0}>{applyUpdate.error}</AppText>
                </View>
              )}
            </View>
          )}
          <AppText style={styles.btnNote}>
            Downloads the latest OTA if available and immediately reloads the app.
          </AppText>

          {/* getSession test */}
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: '#0d1f33' }, sessionTest.status === 'loading' && styles.btnDisabled]}
            onPress={handleTestGetSession}
            disabled={sessionTest.status === 'loading'}
            activeOpacity={0.8}
          >
            {sessionTest.status === 'loading'
              ? <ActivityIndicator size="small" color="#7EC8FF" />
              : <Shield size={15} color="#7EC8FF" />
            }
            <AppText style={[styles.actionBtnLabel, { color: '#7EC8FF' }]}>
              {sessionTest.status === 'loading' ? 'Getting session…' : 'Test getSession()'}
            </AppText>
          </TouchableOpacity>
          {sessionTest.status !== 'idle' && (
            <View style={[
              styles.rpcCard,
              sessionTest.status === 'loading' && styles.rpcCardLoading,
              sessionTest.status === 'success' && { backgroundColor: '#0d1f33', borderColor: '#1a4a6a' },
              sessionTest.status === 'error' && styles.rpcCardError,
            ]}>
              <View style={styles.rpcCardHeader}>
                <AppText style={[styles.rpcCardStatus, { color: sessionTest.status === 'error' ? '#FF6B6B' : '#7EC8FF' }]}>
                  GET SESSION — {sessionTest.status.toUpperCase()}
                </AppText>
                {sessionTest.ranAt && <AppText style={styles.rpcCardTs} selectable>{sessionTest.ranAt.substring(11, 19)}</AppText>}
              </View>
              {(sessionTest.result || sessionTest.error) && (
                <View style={styles.rpcCardField}>
                  <AppText style={styles.rpcCardFieldValue} selectable numberOfLines={0}>
                    {sessionTest.result ?? sessionTest.error}
                  </AppText>
                </View>
              )}
            </View>
          )}
          <AppText style={styles.btnNote}>
            Calls supabase.auth.getSession() and logs full result to console.
          </AppText>

          {/* DB test */}
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: '#1a1a0d' }, dbTest.status === 'loading' && styles.btnDisabled]}
            onPress={handleTestDb}
            disabled={dbTest.status === 'loading'}
            activeOpacity={0.8}
          >
            {dbTest.status === 'loading'
              ? <ActivityIndicator size="small" color="#FFD966" />
              : <RefreshCw size={15} color="#FFD966" />
            }
            <AppText style={[styles.actionBtnLabel, { color: '#FFD966' }]}>
              {dbTest.status === 'loading' ? 'Testing DB…' : 'Test DB (profiles select)'}
            </AppText>
          </TouchableOpacity>
          {dbTest.status !== 'idle' && (
            <View style={[
              styles.rpcCard,
              dbTest.status === 'loading' && styles.rpcCardLoading,
              dbTest.status === 'success' && { backgroundColor: '#1a1a0d', borderColor: '#4a4a1a' },
              dbTest.status === 'error' && styles.rpcCardError,
            ]}>
              <View style={styles.rpcCardHeader}>
                <AppText style={[styles.rpcCardStatus, { color: dbTest.status === 'error' ? '#FF6B6B' : '#FFD966' }]}>
                  DB TEST — {dbTest.status.toUpperCase()}
                </AppText>
                {dbTest.ranAt && <AppText style={styles.rpcCardTs} selectable>{dbTest.ranAt.substring(11, 19)}</AppText>}
              </View>
              {(dbTest.result || dbTest.error) && (
                <View style={styles.rpcCardField}>
                  <AppText style={styles.rpcCardFieldValue} selectable numberOfLines={0}>
                    {dbTest.result ?? dbTest.error}
                  </AppText>
                </View>
              )}
            </View>
          )}
          <AppText style={styles.btnNote}>
            Calls supabase.from('profiles').select('*').limit(1) and logs full result to console.
          </AppText>

          <TouchableOpacity
            style={[styles.actionBtn, styles.actionBtnNeutral]}
            onPress={handleShareDebugInfo}
            activeOpacity={0.8}
          >
            <Share2 size={15} color="#fff" />
            <AppText style={styles.actionBtnLabel}>Copy Debug Info</AppText>
          </TouchableOpacity>
          <AppText style={styles.btnNote}>
            Opens share sheet with all debug values and recent events as JSON.
          </AppText>
        </View>
      </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  otaBanner: {
    backgroundColor: '#000000',
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  probeButton: {
    backgroundColor: '#1A3A5C',
    borderWidth: 1,
    borderColor: '#2A6099',
    borderRadius: Radius.md,
    paddingVertical: 10,
    paddingHorizontal: Spacing.md,
    marginHorizontal: Spacing.md,
    marginVertical: 6,
    alignItems: 'center',
  },
  probeButtonText: {
    color: '#4FC3F7',
    fontFamily: 'Inter-SemiBold',
    fontSize: FontSize.sm,
    letterSpacing: 0.5,
  },
  otaBannerText: {
    color: '#FFFFFF',
    fontFamily: 'Inter-Bold',
    fontSize: 28,
    letterSpacing: 2,
    textAlign: 'center',
  },
  root: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1f',
  },
  back: {
    width: 44,
    height: 44,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  title: {
    fontSize: FontSize.md,
    fontFamily: 'Inter-SemiBold',
    color: '#fff',
  },
  content: {
    paddingBottom: 60,
  },
  sectionHeader: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1f',
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: 'Inter-SemiBold',
    color: '#777',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#111115',
    gap: Spacing.sm,
  },
  label: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    color: '#888',
    width: 180,
    flexShrink: 0,
  },
  value: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: '#e0e0e0',
    flex: 1,
  },
  valueNull: {
    color: '#666',
    fontStyle: 'italic',
  },
  valueBad: {
    color: '#FF6B6B',
  },
  buttonArea: {
    marginTop: Spacing.xl,
    paddingHorizontal: Spacing.md,
    gap: Spacing.xs,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md,
    paddingVertical: 13,
    marginTop: Spacing.sm,
    gap: Spacing.xs,
  },
  actionBtnDanger: {
    backgroundColor: '#8B0000',
  },
  actionBtnWarn: {
    backgroundColor: '#7A4500',
  },
  actionBtnNeutral: {
    backgroundColor: '#1E3A5F',
  },
  btnDisabled: {
    opacity: 0.5,
  },
  actionBtnLabel: {
    fontSize: FontSize.sm,
    fontFamily: 'Inter-SemiBold',
    color: '#fff',
  },
  btnNote: {
    fontSize: 11,
    color: '#777',
    textAlign: 'center',
    lineHeight: 16,
    paddingHorizontal: Spacing.sm,
  },
  blockedBanner: {
    backgroundColor: 'rgba(255,60,60,0.15)',
    borderLeftWidth: 3,
    borderLeftColor: '#FF3C3C',
    paddingVertical: 8,
    paddingHorizontal: Spacing.md,
    marginHorizontal: Spacing.sm,
    marginVertical: 4,
    borderRadius: 4,
  },
  blockedBannerText: {
    fontSize: 11,
    fontFamily: 'Inter-SemiBold',
    color: '#FF6B6B',
    lineHeight: 16,
  },
  eventsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  eventsCount: {
    fontSize: 11,
    fontFamily: 'Inter-Regular',
    color: '#777',
  },
  clearEventsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    padding: 4,
  },
  clearEventsBtnText: {
    fontSize: 11,
    fontFamily: 'Inter-Medium',
    color: '#777',
  },
  emptyEvents: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  rpcCard: {
    borderRadius: Radius.md,
    padding: Spacing.sm,
    marginTop: 6,
    gap: 8,
    borderWidth: 1,
  },
  rpcCardLoading: {
    backgroundColor: '#1a1a0d',
    borderColor: '#4a4a1a',
  },
  rpcCardSuccess: {
    backgroundColor: '#0d2b0d',
    borderColor: '#2d6a2d',
  },
  rpcCardError: {
    backgroundColor: '#2b0d0d',
    borderColor: '#6a2d2d',
  },
  rpcCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  rpcCardStatus: {
    fontSize: 13,
    fontFamily: 'Inter-Bold',
    letterSpacing: 0.5,
  },
  rpcCardTs: {
    fontSize: 10,
    fontFamily: 'Inter-Regular',
    color: '#666',
    flexShrink: 1,
  },
  rpcCardField: {
    gap: 2,
  },
  rpcCardFieldLabel: {
    fontSize: 10,
    fontFamily: 'Inter-SemiBold',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  rpcCardFieldValue: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: '#ddd',
    lineHeight: 18,
  },
  emptyEventsText: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
  },
  eventRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.md,
    paddingVertical: 7,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#111115',
    gap: Spacing.sm,
    alignItems: 'flex-start',
  },
  eventTime: {
    fontSize: 10,
    fontFamily: 'Inter-Regular',
    color: '#666',
    width: 60,
    flexShrink: 0,
    paddingTop: 2,
  },
  eventBody: {
    flex: 1,
    gap: 2,
  },
  eventTag: {
    fontSize: 11,
    fontFamily: 'Inter-SemiBold',
    letterSpacing: 0.3,
  },
  eventPairs: {
    fontSize: 10,
    fontFamily: 'Inter-Regular',
    color: '#666',
    lineHeight: 14,
  },
});
