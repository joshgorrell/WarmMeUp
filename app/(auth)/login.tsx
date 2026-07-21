import React, { useState } from 'react';
import {
  View, StyleSheet, TouchableOpacity,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import AppText from '@/components/AppText';
import AppTextInput from '@/components/AppTextInput';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase, getSupabaseDiagnostics } from '@/lib/supabase';
import { signInWithProvider, isOAuthSupported } from '@/lib/oauth';
import { savePendingCode, loadPendingCode, clearPendingCode } from '@/lib/inviteCode';
import { friendlyAuthError } from '@/lib/authError';
import { completePendingJoin } from '@/lib/coupleJoin';
import { logDebugEvent } from '@/lib/debugLog';
import WarmupBrand from '@/components/WarmupBrand';
import PrimaryButton from '@/components/PrimaryButton';
import AppleIcon from '@/components/icons/AppleIcon';
import GoogleIcon from '@/components/icons/GoogleIcon';
import { FontSize, Spacing, Radius } from '@/constants/theme';
import { useLayout } from '@/hooks/useLayout';
import { logger } from '@/lib/logger';

const V_SM = 16;
const V_MD = 24;
const INPUT_PAD = 14;

// Runs two lightweight fetches to detect connectivity vs. Supabase-specific
// issues. Results are written to SecureStore so the debug screen can surface them.
async function probeSupabaseNetwork(): Promise<void> {
  const base = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
  if (!base) return;

  // Probe 1 — root URL
  try {
    const r = await fetch(base, { method: 'GET' });
    await Promise.all([
      SecureStore.setItemAsync('debug_network_supabase_root_ok', 'true').catch(() => {}),
      SecureStore.setItemAsync('debug_network_supabase_root_status', String(r.status)).catch(() => {}),
    ]);
    logDebugEvent('NETWORK PROBE root', { status: r.status });
  } catch (e: any) {
    await Promise.all([
      SecureStore.setItemAsync('debug_network_supabase_root_ok', 'false').catch(() => {}),
      SecureStore.setItemAsync('debug_network_supabase_root_status', e?.message ?? 'error').catch(() => {}),
    ]);
    logDebugEvent('NETWORK PROBE root error', { error: e?.message ?? 'unknown' });
  }

  // Probe 2 — auth health endpoint (no headers)
  try {
    const r = await fetch(`${base}/auth/v1/health`, { method: 'GET' });
    let body = '';
    try { body = await r.text(); } catch {}
    await Promise.all([
      SecureStore.setItemAsync('debug_network_supabase_auth_health_ok', String(r.ok)).catch(() => {}),
      SecureStore.setItemAsync('debug_network_supabase_auth_health_status', String(r.status)).catch(() => {}),
      SecureStore.setItemAsync('debug_network_supabase_auth_health_error', r.ok ? '' : body.slice(0, 200)).catch(() => {}),
    ]);
    logDebugEvent('NETWORK PROBE auth/v1/health', { status: r.status, ok: r.ok });
  } catch (e: any) {
    await Promise.all([
      SecureStore.setItemAsync('debug_network_supabase_auth_health_ok', 'false').catch(() => {}),
      SecureStore.setItemAsync('debug_network_supabase_auth_health_status', 'error').catch(() => {}),
      SecureStore.setItemAsync('debug_network_supabase_auth_health_error', e?.message ?? 'unknown').catch(() => {}),
    ]);
    logDebugEvent('NETWORK PROBE auth/v1/health error', { error: e?.message ?? 'unknown' });
  }

  // Probe 3 — auth health WITH apikey header (key diagnostic: does RN fetch deliver custom headers?)
  // Expected: 200 if headers arrive, 401 "No API key found" if RN networking strips them.
  try {
    const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
    const r = await fetch(`${base}/auth/v1/health`, {
      method: 'GET',
      headers: { apikey: anonKey },
    });
    let body = '';
    try { body = await r.text(); } catch {}
    await Promise.all([
      SecureStore.setItemAsync('debug_network_raw_fetch_with_key_ok', String(r.ok)).catch(() => {}),
      SecureStore.setItemAsync('debug_network_raw_fetch_with_key_status', String(r.status)).catch(() => {}),
      SecureStore.setItemAsync('debug_network_raw_fetch_with_key_error', r.ok ? '' : body.slice(0, 200)).catch(() => {}),
    ]);
    logDebugEvent('NETWORK PROBE health+apikey', { status: r.status, ok: r.ok });
  } catch (e: any) {
    await Promise.all([
      SecureStore.setItemAsync('debug_network_raw_fetch_with_key_ok', 'false').catch(() => {}),
      SecureStore.setItemAsync('debug_network_raw_fetch_with_key_status', 'error').catch(() => {}),
      SecureStore.setItemAsync('debug_network_raw_fetch_with_key_error', e?.message ?? 'unknown').catch(() => {}),
    ]);
    logDebugEvent('NETWORK PROBE health+apikey error', { error: e?.message ?? 'unknown' });
  }

  // Probe 4 — token endpoint WITH apikey + dummy credentials
  // Expected: 400 "Invalid login credentials" if headers arrive, 401 "No API key" if stripped.
  try {
    const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
    const r = await fetch(`${base}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: 'probe@probe.test', password: 'probe-wrong-v36' }),
    });
    let body = '';
    try { body = await r.text(); } catch {}
    await Promise.all([
      SecureStore.setItemAsync('debug_network_raw_auth_with_key_ok', String(r.ok)).catch(() => {}),
      SecureStore.setItemAsync('debug_network_raw_auth_with_key_status', String(r.status)).catch(() => {}),
      SecureStore.setItemAsync('debug_network_raw_auth_with_key_error', body.slice(0, 300)).catch(() => {}),
    ]);
    logDebugEvent('NETWORK PROBE token+apikey', { status: r.status, ok: r.ok });
  } catch (e: any) {
    await Promise.all([
      SecureStore.setItemAsync('debug_network_raw_auth_with_key_ok', 'false').catch(() => {}),
      SecureStore.setItemAsync('debug_network_raw_auth_with_key_status', 'error').catch(() => {}),
      SecureStore.setItemAsync('debug_network_raw_auth_with_key_error', e?.message ?? 'unknown').catch(() => {}),
    ]);
    logDebugEvent('NETWORK PROBE token+apikey error', { error: e?.message ?? 'unknown' });
  }
}

export default function LoginScreen() {
  const router = useRouter();
  const { pendingCode, prefilledCode } = useLocalSearchParams<{ pendingCode?: string; prefilledCode?: string }>();
  const codeToPreserve = (pendingCode || prefilledCode || '').toUpperCase().trim();
  const { width, isTablet, contentMaxWidth } = useLayout();
  const logoSize = Math.min(Math.round(width * 0.18), 72);
  const sloganWidth = Math.min(Math.round(width * 0.52), 210);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<'apple' | 'google' | null>(null);
  const [error, setError] = useState('');

  // Hidden 5-second logo hold — intentional no-auth emergency escape hatch to debug screen
  const handleLogoHold = () => {
    router.push('/debug-access');
  };

  const handleLogin = async () => {
    // Fire the debug event as the very first statement — before any validation or
    // early returns — so it appears in recentEvents even if we bail out early.
    logDebugEvent('LOGIN BUTTON PRESSED', {
      handler: 'login.tsx:handleLogin',
      emailPresent: !!email.trim(),
      passwordPresent: !!password.trim(),
    });
    SecureStore.setItemAsync('debug_login_button_pressed_at', new Date().toISOString()).catch(() => {});
    SecureStore.setItemAsync('debug_login_handler_file', 'login.tsx').catch(() => {});
    SecureStore.setItemAsync('debug_login_handler_name', 'handleLogin').catch(() => {});

    if (!email.trim() || !password.trim()) {
      setError('Please enter your email and password.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      SecureStore.setItemAsync('debug_login_reached_preflight', 'true').catch(() => {});
      // Capture auth-client internals immediately before the call and persist
      // them so the debug screen shows what was present at attempt time.
      const authInternal = supabase.auth as any;
      const authHeaders: Record<string, string> = authInternal?.headers ?? {};
      const diag = getSupabaseDiagnostics();
      const attemptPayload = JSON.stringify({
        attemptAt: new Date().toISOString(),
        email: email.trim(),
        method: 'signInWithPassword',
        clientSource: 'supabase (shared lib/supabase.ts)',
        clientUrl: authInternal?.url ?? 'UNKNOWN',
        hasAnonKey: Boolean(authHeaders?.apikey),
        anonKeyLength: (authHeaders?.apikey ?? '').length,
        authHeaderKeys: Object.keys(authHeaders).join(', ') || '(none)',
        diagClientHasAnonKey: diag.clientHasAnonKey,
        diagClientAnonKeyLength: diag.clientAnonKeyLength,
        diagSourcesMatch: diag.sourcesMatch,
      });
      // Write synchronously before the auth call so the data is present even if
      // the app is killed mid-request. Surface any write error instead of swallowing it.
      try {
        await Promise.all([
          SecureStore.setItemAsync('debug_last_login_attempt', attemptPayload),
          SecureStore.setItemAsync('debug_auth_last_attempt_at', new Date().toISOString()),
          // Standardised preflight fields (same keys as unlock.tsx so debug screen shows both)
          SecureStore.setItemAsync('debug_login_button_pressed_at', new Date().toISOString()),
          SecureStore.setItemAsync('debug_login_handler_file', 'login.tsx:handleLogin'),
          SecureStore.setItemAsync('debug_login_preflight_has_supabase_client', String(!!supabase)),
          SecureStore.setItemAsync('debug_login_preflight_has_anon_key', String(diag.clientHasAnonKey)),
          SecureStore.setItemAsync('debug_login_preflight_anon_key_length', String(diag.clientAnonKeyLength)),
          SecureStore.setItemAsync('debug_login_reached_signInWithPassword', 'false'),
          SecureStore.setItemAsync('debug_login_error_source', ''),
          SecureStore.setItemAsync('debug_login_visible_error_message', ''),
        ]);
      } catch (writeErr) {
        console.error('[Login] SecureStore write failed:', writeErr);
      }
      logger.log('[Login] attempt recorded', attemptPayload);

      await SecureStore.setItemAsync('debug_login_reached_signInWithPassword', 'true').catch(() => {});

      // V37 probe: build a Request object and inspect req.headers.entries() before fetching.
      // Tests whether fetch(RequestObject) delivers headers — the path supabase-js uses internally.
      try {
        const probeAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
        const probeBase = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
        const probeReq = new Request(`${probeBase}/auth/v1/health`, {
          method: 'GET',
          headers: {
            apikey: probeAnonKey,
            Authorization: `Bearer ${probeAnonKey}`,
          },
        });
        const headerEntries = Array.from(probeReq.headers.entries());
        const headerEntriesJson = JSON.stringify(headerEntries);
        await SecureStore.setItemAsync('debug_v37_req_headers_entries', headerEntriesJson).catch(() => {});

        const probeR = await fetch(probeReq);
        let probeBody = '';
        try { probeBody = await probeR.text(); } catch {}
        await Promise.all([
          SecureStore.setItemAsync('debug_v37_req_fetch_status', String(probeR.status)).catch(() => {}),
          SecureStore.setItemAsync('debug_v37_req_fetch_ok', String(probeR.ok)).catch(() => {}),
          SecureStore.setItemAsync('debug_v37_req_fetch_body', probeBody.slice(0, 300)).catch(() => {}),
        ]);
        logDebugEvent('V37 REQUEST PROBE', { headerCount: headerEntries.length, status: probeR.status, ok: probeR.ok });
      } catch (probeErr: any) {
        await Promise.all([
          SecureStore.setItemAsync('debug_v37_req_headers_entries', `ERROR: ${probeErr?.message ?? 'unknown'}`).catch(() => {}),
          SecureStore.setItemAsync('debug_v37_req_fetch_status', 'error').catch(() => {}),
          SecureStore.setItemAsync('debug_v37_req_fetch_ok', 'false').catch(() => {}),
          SecureStore.setItemAsync('debug_v37_req_fetch_body', probeErr?.message ?? 'unknown').catch(() => {}),
        ]);
        logDebugEvent('V37 REQUEST PROBE ERROR', { error: probeErr?.message ?? 'unknown' });
      }

      const { data, error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (err) {
        const errPayload = JSON.stringify({
          message: err.message,
          status: (err as any).status ?? null,
          name: err.name ?? null,
          code: (err as any).code ?? null,
          httpBody: (err as any).__isAuthError
            ? ((err as any).status + ' ' + err.message)
            : ((err as any).body ?? (err as any).details ?? null),
          stack: (err as any).stack ?? null,
          clientDiag: getSupabaseDiagnostics(),
        });
        console.error('[Login] AUTH ERROR FULL', JSON.stringify(err, null, 2));
        console.error('[Login] AUTH ERROR extra', errPayload);
        logDebugEvent('LOGIN SIGN_IN_ERROR', {
          handler: 'login.tsx:handleLogin',
          message: err.message,
          status: (err as any).status ?? null,
          code: (err as any).code ?? null,
        });
        // Write every individual error field plus the full blob so debug rows
        // show raw values without parsing JSON.
        await Promise.all([
          SecureStore.setItemAsync('debug_last_auth_error', errPayload).catch(() => {}),
          SecureStore.setItemAsync('debug_auth_error_message', err.message ?? '').catch(() => {}),
          SecureStore.setItemAsync('debug_auth_error_status', String((err as any).status ?? '')).catch(() => {}),
          SecureStore.setItemAsync('debug_auth_error_code', String((err as any).code ?? '')).catch(() => {}),
          SecureStore.setItemAsync('debug_auth_error_full_json', errPayload).catch(() => {}),
          SecureStore.setItemAsync('debug_login_error_source', 'login.tsx:signInWithPassword:error').catch(() => {}),
          SecureStore.setItemAsync('debug_login_visible_error_message', friendlyAuthError(err)).catch(() => {}),
          SecureStore.setItemAsync('debug_login_error_full_json', errPayload).catch(() => {}),
          // Individual raw fields (new — surfaces what was previously buried in the JSON blob)
          SecureStore.setItemAsync('debug_login_error_name', err.name ?? '').catch(() => {}),
          SecureStore.setItemAsync('debug_login_error_message', err.message ?? '').catch(() => {}),
          SecureStore.setItemAsync('debug_login_error_status', String((err as any).status ?? '')).catch(() => {}),
          SecureStore.setItemAsync('debug_login_error_code', String((err as any).code ?? '')).catch(() => {}),
          SecureStore.setItemAsync('debug_login_error_stack', ((err as any).stack ?? '').slice(0, 500)).catch(() => {}),
        ]);
        // Fire network probes async — don't block the UI, results written when ready.
        probeSupabaseNetwork().catch(() => {});
        throw err;
      }
      logger.log('[Login] signInWithPassword success', { userId: data.user?.id ?? null });
      await SecureStore.setItemAsync('debug_login_error_source', 'none:success').catch(() => {});

      // Full signin-persistence probe: record every observable checkpoint so the
      // debug screen can show exactly what happened at the moment of sign-in.
      try {
        const signinAt = new Date().toISOString();
        const accessTokenPresent = !!data.session?.access_token;
        const refreshTokenPresent = !!data.session?.refresh_token;

        // Check getSession immediately — if supabase-js persisted the session this
        // will return it; if storage is broken it will return null here.
        const { data: sessionCheck } = await supabase.auth.getSession();
        const sessionAfterSignin = sessionCheck?.session ?? null;

        // Directly inspect SecureStore keys — the ground truth for persistence.
        const supabaseUrlRaw = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
        const projectRef = supabaseUrlRaw.replace(/^https?:\/\//, '').split('.')[0] ?? '';
        const sessionKey = `sb-${projectRef}-auth-token`;
        const [sv0, sv1, sv2] = await Promise.all([
          SecureStore.getItemAsync(sessionKey).catch(() => null),
          SecureStore.getItemAsync(`${sessionKey}.0`).catch(() => null),
          SecureStore.getItemAsync(`${sessionKey}.1`).catch(() => null),
        ]);
        const foundKeys: string[] = [];
        if (sv0 !== null) foundKeys.push(sessionKey);
        if (sv1 !== null) foundKeys.push(`${sessionKey}.0`);
        if (sv2 !== null) foundKeys.push(`${sessionKey}.1`);
        const rawSession = (sv1 !== null ? (sv1 + (sv2 ?? '')) : sv0) ?? null;
        let storeParseOk: boolean | null = null;
        if (rawSession !== null) {
          try { JSON.parse(rawSession); storeParseOk = true; } catch { storeParseOk = false; }
        }

        await Promise.all([
          SecureStore.setItemAsync('debug_last_signin_success', signinAt),
          SecureStore.setItemAsync('debug_last_signin_user_id', data.user?.id ?? ''),
          SecureStore.setItemAsync('debug_last_signin_session_present', String(!!data.session)),
          SecureStore.setItemAsync('debug_last_signin_access_token_present', String(accessTokenPresent)),
          SecureStore.setItemAsync('debug_last_signin_refresh_token_present', String(refreshTokenPresent)),
          SecureStore.setItemAsync('debug_after_signin_getSession_has_session', String(!!sessionAfterSignin)),
          SecureStore.setItemAsync('debug_after_signin_getSession_user_id', sessionAfterSignin?.user?.id ?? ''),
          SecureStore.setItemAsync('debug_after_signin_storage_keys_found', foundKeys.length ? foundKeys.join(', ') : '(none found)'),
          SecureStore.setItemAsync('debug_after_signin_session_key_exists', String(foundKeys.length > 0)),
          SecureStore.setItemAsync('debug_after_signin_session_raw_length', String(rawSession?.length ?? 0)),
          SecureStore.setItemAsync('debug_after_signin_session_parse_ok', storeParseOk === null ? 'null' : String(storeParseOk)),
        ]);
        logger.log('[Login] persistence probe:', {
          accessTokenPresent, refreshTokenPresent,
          sessionAfterSignin: !!sessionAfterSignin,
          storageKeysFound: foundKeys,
          rawLength: rawSession?.length ?? 0,
          parseOk: storeParseOk,
        });
      } catch (writeErr) {
        console.error('[Login] persistence probe write failed:', writeErr);
      }

      // After sign-in, check for a stored pending invite code (survives app restarts).
      // Route-param code takes priority over stored code.
      const storedCode = await loadPendingCode();
      const codeToRedeem = codeToPreserve || storedCode || '';

      if (codeToRedeem && data.user) {
        const result = await completePendingJoin(data.user.id, codeToRedeem);
        await clearPendingCode();
        if (result.ok) {
          router.replace({
            pathname: '/(auth)/pair',
            params: { prefilledCode: codeToRedeem },
          });
          return;
        }
        // Join failed — fall through to normal transition; user can pair from account screen
      }

      router.replace('/transition');
    } catch (e: unknown) {
      setError(friendlyAuthError(e));
    } finally {
      setLoading(false);
    }
  };

  const handleOAuth = async (provider: 'apple' | 'google') => {
    setError('');
    setOauthLoading(provider);
    try {
      // Persist code before OAuth redirect — app may restart during the flow.
      if (codeToPreserve) await savePendingCode(codeToPreserve);
      const session = await signInWithProvider(provider);
      if (!session) return;

      const userId = session.user?.id;
      if (userId) {
        const { data: existing } = await supabase
          .from('profiles')
          .select('id')
          .eq('id', userId)
          .maybeSingle();
        if (!existing) {
          // New OAuth user — route through onboarding; register.tsx now handles code inline.
          router.replace('/(auth)/onboarding');
        } else {
          // Existing user signing in — check for stored or param code to redeem.
          const storedCode = await loadPendingCode();
          const codeToRedeem = codeToPreserve || storedCode || '';
          if (codeToRedeem) {
            const result = await completePendingJoin(userId, codeToRedeem);
            await clearPendingCode();
            if (result.ok) {
              router.replace({
                pathname: '/(auth)/pair',
                params: { prefilledCode: codeToRedeem },
              });
              return;
            }
          }
          router.replace('/transition');
        }
      }
    } catch (e: unknown) {
      setError(friendlyAuthError(e));
    } finally {
      setOauthLoading(null);
    }
  };

  const showGoogle = isOAuthSupported('google');
  const showApple = isOAuthSupported('apple');

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      <LinearGradient colors={['#080608', '#0A080A', '#0D0A0D']} style={StyleSheet.absoluteFill} />
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          isTablet && { paddingHorizontal: Math.max(Spacing.xl, (width - contentMaxWidth) / 2) },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <View style={isTablet ? [styles.innerWrap, { maxWidth: contentMaxWidth, alignSelf: 'center', width: '100%' }] : styles.innerWrap}>
          {/* Brand — hold 5 seconds to open debug screen */}
          <TouchableOpacity
            style={[styles.brandBlock, { marginBottom: V_MD }]}
            onLongPress={handleLogoHold}
            delayLongPress={5000}
            activeOpacity={1}
          >
            <WarmupBrand logoSize={logoSize} sloganWidth={sloganWidth} showTagline />
          </TouchableOpacity>

          {/* Sign-in panel */}
          <View style={[styles.panel, { padding: V_MD, gap: V_SM }]}>
            {/* Email field */}
            <View style={styles.field}>
              <AppText style={styles.label}>Email</AppText>
              <AppTextInput
                style={[styles.input, { paddingVertical: INPUT_PAD }]}
                value={email}
                onChangeText={setEmail}
                placeholder="your@email.com"
                placeholderTextColor="rgba(255,255,255,0.2)"
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
              />
            </View>

            {/* Password field */}
            <View style={styles.field}>
              <View style={styles.passwordLabelRow}>
                <AppText style={styles.label}>Password</AppText>
                <TouchableOpacity onPress={() => router.push('/(auth)/forgot-password')} activeOpacity={0.7}>
                  <AppText style={styles.forgotLink}>Forgot?</AppText>
                </TouchableOpacity>
              </View>
              <AppTextInput
                style={[styles.input, { paddingVertical: INPUT_PAD }]}
                value={password}
                onChangeText={setPassword}
                placeholder="Your password"
                placeholderTextColor="rgba(255,255,255,0.2)"
                secureTextEntry
              />
            </View>

            {error ? <AppText style={styles.error}>{error}</AppText> : null}

            <PrimaryButton
              label="Sign In"
              onPress={handleLogin}
              loading={loading || oauthLoading !== null}
            />

            {/* Social sign-in */}
            {(showGoogle || showApple) && (
              <>
                <View style={styles.dividerRow}>
                  <View style={styles.dividerLine} />
                  <AppText style={styles.dividerText}>or continue with</AppText>
                  <View style={styles.dividerLine} />
                </View>

                <View style={styles.socialRow}>
                  {showApple && (
                    <TouchableOpacity
                      style={[styles.socialBtn, styles.appleBtn, { paddingVertical: INPUT_PAD + 2 }]}
                      onPress={() => handleOAuth('apple')}
                      activeOpacity={0.88}
                      disabled={oauthLoading !== null || loading}
                    >
                      <AppleIcon color="#fff" size={18} />
                      <AppText style={styles.appleBtnText}>
                        {oauthLoading === 'apple' ? 'Signing in…' : 'Apple'}
                      </AppText>
                    </TouchableOpacity>
                  )}

                  {showGoogle && (
                    <TouchableOpacity
                      style={[styles.socialBtn, styles.googleBtn, { paddingVertical: INPUT_PAD + 2 }]}
                      onPress={() => handleOAuth('google')}
                      activeOpacity={0.88}
                      disabled={oauthLoading !== null || loading}
                    >
                      <GoogleIcon size={18} />
                      <AppText style={styles.googleBtnText}>
                        {oauthLoading === 'google' ? 'Signing in…' : 'Google'}
                      </AppText>
                    </TouchableOpacity>
                  )}
                </View>
              </>
            )}
          </View>

          {/* Footer */}
          <TouchableOpacity
            style={[styles.footerLink, { marginTop: V_SM }]}
            onPress={() => router.replace(codeToPreserve
              ? { pathname: '/(auth)/register', params: { pendingCode: codeToPreserve } }
              : '/(auth)/register'
            )}
            activeOpacity={0.7}
          >
            <AppText style={styles.footerText}>
              No account?{'  '}
              <AppText style={styles.footerAccent}>Create one</AppText>
            </AppText>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.xxl,
  },
  innerWrap: {
    width: '100%',
    alignItems: 'center',
  },
  brandBlock: {
    alignItems: 'center',
  },
  panel: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  field: { gap: 6 },
  passwordLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  forgotLink: {
    color: '#FF7A45',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-SemiBold',
  },
  label: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Medium',
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.055)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    borderRadius: Radius.lg,
    color: '#fff',
    fontSize: FontSize.md,
    fontFamily: 'Inter-Regular',
    paddingHorizontal: Spacing.md,
  },
  error: {
    color: '#FF5A5F',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  dividerText: {
    color: 'rgba(255,255,255,0.28)',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
  },
  socialRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  socialBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
  appleBtn: {
    backgroundColor: '#1A1A1A',
    borderColor: 'rgba(255,255,255,0.14)',
  },
  appleBtnText: {
    color: '#fff',
    fontSize: FontSize.body,
    fontFamily: 'Inter-SemiBold',
  },
  googleBtn: {
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderColor: 'rgba(255,255,255,0.12)',
  },
  googleBtnText: {
    color: '#1A1A1A',
    fontSize: FontSize.body,
    fontFamily: 'Inter-SemiBold',
  },
  footerLink: {
    paddingVertical: Spacing.sm,
  },
  footerText: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
  },
  footerAccent: {
    color: '#E05548',
    fontFamily: 'Inter-SemiBold',
  },
});
