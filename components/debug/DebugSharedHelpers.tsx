import React from 'react';
import { View, StyleSheet } from 'react-native';
import AppText from '@/components/AppText';
import { DebugEvent } from '@/lib/debugLog';
import { Spacing, FontSize } from '@/constants/theme';

// ── Shared presentational helpers used across debug subcomponents ──

export function Row({ label, value }: { label: string; value: string | number | boolean | null | undefined }) {
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
    <View style={sharedStyles.row}>
      <AppText style={sharedStyles.label}>{label}</AppText>
      <AppText
        style={[
          sharedStyles.value,
          isNull && sharedStyles.valueNull,
          isBad && !isNull && sharedStyles.valueBad,
        ]}
        numberOfLines={2}
        selectable
      >
        {display}
      </AppText>
    </View>
  );
}

export function Section({ title }: { title: string }) {
  return (
    <View style={sharedStyles.sectionHeader}>
      <AppText style={sharedStyles.sectionTitle}>{title}</AppText>
    </View>
  );
}

export function EventRow({ event }: { event: DebugEvent }) {
  const time = event.timestamp.substring(11, 19);
  const isError = event.tag.includes('ERROR');
  const isSuccess = event.tag.includes('SUCCESS');
  const tagColor = isError ? '#FF6B6B' : isSuccess ? '#4CAF50' : '#FFA040';
  const pairs = Object.entries(event.data)
    .map(([k, v]) => `${k}=${v === null ? 'null' : String(v)}`)
    .join('  ');
  return (
    <View style={sharedStyles.eventRow}>
      <AppText style={sharedStyles.eventTime}>{time}</AppText>
      <View style={sharedStyles.eventBody}>
        <AppText style={[sharedStyles.eventTag, { color: tagColor }]}>[{event.tag}]</AppText>
        {!!pairs && (
          <AppText style={sharedStyles.eventPairs} selectable numberOfLines={4}>{pairs}</AppText>
        )}
      </View>
    </View>
  );
}

// ── Shared types used by multiple debug subcomponents ──

export type RpcTestState = {
  status: 'idle' | 'loading' | 'success' | 'error' | 'timeout';
  ranAt: string | null;
  result: any | null;
  error: { code: string | null; message: string | null; details: string | null; hint: string | null } | null;
};

export type DbIdentityState = {
  status: 'idle' | 'loading' | 'success' | 'error';
  ranAt: string | null;
  result: any | null;
  error: { code: string | null; message: string | null; details: string | null; hint: string | null } | null;
};

export type CheckUpdateState = {
  status: 'idle' | 'loading' | 'success' | 'error';
  ranAt: string | null;
  isAvailable: boolean | null;
  manifest: string | null;
  error: string | null;
};

export type ApplyUpdateState = {
  status: 'idle' | 'checking' | 'no-update' | 'fetching' | 'reloading' | 'error';
  ranAt: string | null;
  error: string | null;
};

export type SessionTestState = {
  status: 'idle' | 'loading' | 'success' | 'error';
  ranAt: string | null;
  result: string | null;
  error: string | null;
};

export type DbTestState = {
  status: 'idle' | 'loading' | 'success' | 'error';
  ranAt: string | null;
  result: string | null;
  error: string | null;
};

export type PushTestSubResult = {
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

export type PushTestState = {
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
};

export type PushDiagState = {
  ranAt: string | null;
  permission_status: string | null;
  token_present: boolean | null;
  token_prefix: string | null;
  project_id_used: string | null;
  last_registered_at: string | null;
  token_in_db: boolean | null;
  token_matches_device: boolean | null;
  db_notifications_enabled: boolean | null;
};

export type AuthProbeState = {
  ranAt: string | null;
  auth_storage_adapter: string | null;
  auth_storage_keys_found: string | null;
  auth_storage_session_key_exists: boolean | null;
  auth_storage_session_raw_length: number | null;
  auth_storage_session_parse_ok: boolean | null;
  auth_storage_session_user_id: string | null;
  auth_storage_session_expires_at: string | null;
  auth_getSession_ran_at: string | null;
  auth_getSession_has_session: boolean | null;
  auth_getSession_user_id: string | null;
  auth_getSession_error_message: string | null;
  auth_getUser_ran_at: string | null;
  auth_getUser_has_user: boolean | null;
  auth_getUser_user_id: string | null;
  auth_getUser_error_message: string | null;
  last_auth_event: string | null;
  last_auth_event_at: string | null;
  auth_client_source: string;
  persisted_error_message: string | null;
  persisted_error_status: string | null;
  persisted_error_code: string | null;
  persisted_error_full_json: string | null;
  persisted_attempt_at: string | null;
  auth_last_signin_success: string | null;
  auth_last_signin_user_id: string | null;
  auth_last_signin_session_present: string | null;
  auth_last_signin_access_token_present: string | null;
  auth_last_signin_refresh_token_present: string | null;
  auth_after_signin_getSession_has_session: string | null;
  auth_after_signin_getSession_user_id: string | null;
  auth_after_signin_storage_keys_found: string | null;
  auth_after_signin_session_key_exists: string | null;
  auth_after_signin_session_raw_length: string | null;
  auth_after_signin_session_parse_ok: string | null;
  auth_session_saved_after_signin: string | null;
  auth_storage_key_after_signin_exists: string | null;
  auth_session_cleared_at: string | null;
  auth_session_cleared_reason: string | null;
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
  network_supabase_root_ok: string | null;
  network_supabase_root_status: string | null;
  network_supabase_auth_health_ok: string | null;
  network_supabase_auth_health_status: string | null;
  network_supabase_auth_health_error: string | null;
  network_raw_fetch_with_key_ok: string | null;
  network_raw_fetch_with_key_status: string | null;
  network_raw_fetch_with_key_error: string | null;
  network_raw_auth_with_key_ok: string | null;
  network_raw_auth_with_key_status: string | null;
  network_raw_auth_with_key_error: string | null;
  v37_req_headers_entries: string | null;
  v37_req_fetch_status: string | null;
  v37_req_fetch_ok: string | null;
  v37_req_fetch_body: string | null;
  v38_ran_at: string | null;
  v38_req_headers_entries: string | null;
  v38_req_has_apikey: string | null;
  v38_req_has_authorization: string | null;
  v38_req_fetch_status: string | null;
  v38_req_fetch_body: string | null;
  v38_url_param_fetch_status: string | null;
  v38_url_param_fetch_body: string | null;
};

// ── Shared styles (duplicated from debug.tsx so subcomponents are self-contained) ──

export const sharedStyles = StyleSheet.create({
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
