import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import AppText from '@/components/AppText';
import { Spacing, Radius, FontSize } from '@/constants/theme';
import { Row, Section, AuthProbeState } from './DebugSharedHelpers';

// ── Auth Session Live Probe + Login Preflight + Network Probes ──
// Extracted from debug.tsx lines ~2025-2114. Pure presentational —
// all data arrives via props; the parent owns the probe state and
// the runAuthProbe callback.

type AuthProbePanelProps = {
  authProbe: AuthProbeState;
  onRunProbe: () => void;
};

export default function AuthProbePanel({ authProbe, onRunProbe }: AuthProbePanelProps) {
  return (
    <>
      {/* ── 4f. Auth Session Live Probe ── */}
      {/* Auto-runs on every screen focus. Tap button to re-run manually. */}
      <Section title="Auth Session Live Probe" />
      <TouchableOpacity
        onPress={onRunProbe}
        style={probeStyles.probeButton}
        activeOpacity={0.75}
      >
        <AppText style={probeStyles.probeButtonText}>Run Auth Session Probe</AppText>
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
    </>
  );
}

const probeStyles = StyleSheet.create({
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
});
