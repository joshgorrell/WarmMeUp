import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, StyleSheet, TouchableOpacity, ActivityIndicator,
  TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import AppText from '@/components/AppText';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScanFace, FingerprintPattern as Fingerprint, Mail } from 'lucide-react-native';
import WarmupBrand from '@/components/WarmupBrand';
import { FontSize, Spacing, Radius } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { useBiometricAuth } from '@/hooks/useBiometricAuth';
import { supabase } from '@/lib/supabase';
import { useLayout } from '@/hooks/useLayout';

export default function UnlockScreen() {
  const router = useRouter();
  const { user, profile, settings, unlockApp, isAuthenticatingRef, debugModeEnabled } = useAuth();
  const { available: bioAvailable, biometricLabel, authenticate } = useBiometricAuth();
  const { width, height, isTablet, contentMaxWidth } = useLayout();
  const insets = useSafeAreaInsets();

  // True once the mode has been set for this mount
  const modeInitialised = useRef(false);
  // True once the biometric prompt has been triggered on this mount
  const biometricAlreadyPrompted = useRef(false);
  const biometricAttemptedThisMount = useRef(false);

  const [showEmailFallback, setShowEmailFallback] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [signingIn, setSigningIn] = useState(false);

  const vXs = Math.round(height * 0.012);
  const vSm = Math.round(height * 0.02);
  const vMd = Math.round(height * 0.03);
  const logoSize = Math.min(Math.round(width * 0.16), 64);

  const proceed = useCallback(() => {
    console.log('[UNLOCK SUCCESS]', {
      userId: user?.id,
      loginMethod: settings?.login_method,
      timestamp: Date.now(),
    });
    biometricAlreadyPrompted.current = false;
    isAuthenticatingRef.current = true;
    unlockApp();
    router.replace('/transition');
    setTimeout(() => { isAuthenticatingRef.current = false; }, 800);
  }, [unlockApp, router, isAuthenticatingRef, user, settings]);

  const tryBiometric = useCallback(async () => {
    if (!bioAvailable) {
      setShowEmailFallback(true);
      return;
    }
    biometricAlreadyPrompted.current = true;
    biometricAttemptedThisMount.current = true;
    isAuthenticatingRef.current = true;
    try {
      const result = await authenticate(`Unlock Warm Me Up`);
      if (result.success) {
        proceed();
      } else {
        isAuthenticatingRef.current = false;
      }
    } catch {
      isAuthenticatingRef.current = false;
    }
  }, [bioAvailable, authenticate, proceed, isAuthenticatingRef]);

  // One-shot: set the initial mode when settings first become available.
  useEffect(() => {
    if (modeInitialised.current || !settings) return;
    modeInitialised.current = true;
    const method = settings.login_method ?? 'password';
    const lockAfter = settings.lock_after_seconds ?? null;
    console.log('[unlock] settings loaded, login_method:', method, 'lock_after_seconds:', lockAfter);

    if (lockAfter !== null && lockAfter < 0) {
      proceed();
      return;
    }
    if (method === 'none' || method === 'password') {
      proceed();
      return;
    }
    // method === 'biometric': auto-trigger biometric prompt
  }, [settings]);

  // Auto-trigger biometric prompt exactly once per screen mount.
  useEffect(() => {
    if (!settings) return;
    const method = settings.login_method ?? 'password';
    if (method !== 'biometric') return;
    if (biometricAlreadyPrompted.current) return;
    if (biometricAttemptedThisMount.current) return;
    tryBiometric();
  }, [settings, tryBiometric]);

  const handleBiometricRetry = useCallback(() => {
    biometricAlreadyPrompted.current = false;
    biometricAttemptedThisMount.current = false;
    setShowEmailFallback(false);
    tryBiometric();
  }, [tryBiometric]);

  const handleEmailSignIn = async () => {
    if (!email.trim() || !password) {
      setAuthError('Please enter your email and password.');
      return;
    }
    setSigningIn(true);
    setAuthError('');

    // Preflight diagnostics — written before signInWithPassword so they survive
    // even if the call throws or never returns.
    const pressedAt = new Date().toISOString();
    const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
    try {
      await Promise.all([
        SecureStore.setItemAsync('debug_login_button_pressed_at', pressedAt),
        SecureStore.setItemAsync('debug_login_handler_file', 'unlock.tsx:handleEmailSignIn'),
        SecureStore.setItemAsync('debug_login_preflight_has_supabase_client', String(!!supabase)),
        SecureStore.setItemAsync('debug_login_preflight_has_anon_key', String(anonKey.length > 0)),
        SecureStore.setItemAsync('debug_login_preflight_anon_key_length', String(anonKey.length)),
        SecureStore.setItemAsync('debug_login_reached_signInWithPassword', 'false'),
        SecureStore.setItemAsync('debug_login_error_source', ''),
        SecureStore.setItemAsync('debug_login_visible_error_message', ''),
      ]);
    } catch {}
    console.log('[unlock] handleEmailSignIn preflight — anonKey length:', anonKey.length, '| client:', !!supabase);

    try {
      await SecureStore.setItemAsync('debug_login_reached_signInWithPassword', 'true').catch(() => {});
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) {
        const visibleMsg = error.message?.toLowerCase().includes('no api key')
          ? 'Could not reach the server. Check your connection and try again.'
          : 'Incorrect email or password.';
        await Promise.all([
          SecureStore.setItemAsync('debug_login_error_source', 'unlock.tsx:signInWithPassword:error').catch(() => {}),
          SecureStore.setItemAsync('debug_login_visible_error_message', visibleMsg).catch(() => {}),
          SecureStore.setItemAsync('debug_auth_error_message', error.message ?? '').catch(() => {}),
          SecureStore.setItemAsync('debug_auth_error_status', String((error as any).status ?? '')).catch(() => {}),
          SecureStore.setItemAsync('debug_auth_error_code', String((error as any).code ?? '')).catch(() => {}),
        ]);
        console.error('[unlock] signInWithPassword error:', error.message, '| status:', (error as any).status);
        setAuthError(visibleMsg);
      } else {
        await SecureStore.setItemAsync('debug_login_error_source', 'none:success').catch(() => {});
        proceed();
      }
    } catch (e: any) {
      const visibleMsg = 'Something went wrong. Please try again.';
      await Promise.all([
        SecureStore.setItemAsync('debug_login_error_source', 'unlock.tsx:catch:' + (e?.message ?? 'unknown')).catch(() => {}),
        SecureStore.setItemAsync('debug_login_visible_error_message', visibleMsg).catch(() => {}),
        SecureStore.setItemAsync('debug_auth_error_message', e?.message ?? 'unknown catch').catch(() => {}),
      ]);
      console.error('[unlock] signInWithPassword threw:', e?.message);
      setAuthError(visibleMsg);
    } finally {
      setSigningIn(false);
    }
  };

  const debugTapCount = useRef(0);
  const debugTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canAccessDebug = useMemo(
    () => __DEV__ || profile?.is_admin === true || debugModeEnabled || process.env.EXPO_PUBLIC_DEBUG_ALWAYS_ON === '1',
    [profile?.is_admin, debugModeEnabled],
  );
  const handleDebugTap = useCallback(() => {
    if (!canAccessDebug) return;
    debugTapCount.current += 1;
    if (debugTapTimer.current) clearTimeout(debugTapTimer.current);
    if (debugTapCount.current >= 5) {
      debugTapCount.current = 0;
      router.replace('/debug');
      return;
    }
    debugTapTimer.current = setTimeout(() => { debugTapCount.current = 0; }, 10000);
  }, [canAccessDebug, router]);

  const BiometricIcon = biometricLabel === 'Touch ID' ? Fingerprint : ScanFace;

  const centerStyle = isTablet
    ? { maxWidth: contentMaxWidth, alignSelf: 'center' as const, width: '100%' as const }
    : {};

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <LinearGradient colors={['#07070A', '#0D0D12', '#151018']} style={StyleSheet.absoluteFill} />

      <View style={[styles.content, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity onPress={handleDebugTap} activeOpacity={1} style={[{ marginBottom: vMd }, centerStyle]}>
          <WarmupBrand logoSize={logoSize} showTagline={false} />
        </TouchableOpacity>

        <View style={centerStyle}>
          {showEmailFallback ? (
            <View style={[styles.fallbackWrap, { gap: vSm }]}>
              <View style={styles.mailIconWrap}>
                <Mail color="#FF2E8A" size={40} strokeWidth={1.5} />
              </View>
              <AppText style={styles.title}>Verify Your Identity</AppText>
              <AppText style={[styles.sub, { marginBottom: vSm, paddingHorizontal: Spacing.md }]}>
                Sign in with your email and password to unlock
              </AppText>

              <View style={[styles.inputWrap, { marginBottom: vXs }]}>
                <TextInput
                  style={styles.input}
                  placeholder="Email"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                />
              </View>
              <View style={styles.inputWrap}>
                <TextInput
                  style={styles.input}
                  placeholder="Password"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoComplete="current-password"
                />
              </View>

              {authError ? (
                <AppText style={[styles.error, { marginTop: vXs }]}>{authError}</AppText>
              ) : null}

              <TouchableOpacity
                style={[styles.signInBtn, signingIn && { opacity: 0.6 }, { marginTop: vSm }]}
                onPress={handleEmailSignIn}
                activeOpacity={0.82}
                disabled={signingIn}
              >
                {signingIn
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <AppText style={styles.signInBtnText}>Sign In</AppText>
                }
              </TouchableOpacity>

              {bioAvailable && (
                <TouchableOpacity style={styles.altLink} onPress={handleBiometricRetry} activeOpacity={0.7}>
                  <BiometricIcon color="rgba(255,255,255,0.4)" size={14} />
                  <AppText style={styles.altLinkText}>Try {biometricLabel} again</AppText>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <View style={[styles.bioWrap, { gap: vSm }]}>
              <TouchableOpacity style={styles.bioButton} onPress={handleBiometricRetry} activeOpacity={0.75}>
                <BiometricIcon color="#FF2E8A" size={52} strokeWidth={1.5} />
              </TouchableOpacity>
              <AppText style={styles.title}>Unlock with {biometricLabel}</AppText>
              <AppText style={styles.sub}>Tap to authenticate</AppText>
              <TouchableOpacity
                style={styles.altLink}
                onPress={() => setShowEmailFallback(true)}
                activeOpacity={0.7}
              >
                <Mail color="rgba(255,255,255,0.4)" size={14} />
                <AppText style={styles.altLinkText}>Use email instead</AppText>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#07070A' },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.xl },
  title: {
    color: '#fff',
    fontSize: FontSize.xxl,
    fontFamily: 'Inter-Bold',
    marginBottom: 6,
    textAlign: 'center',
  },
  sub: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
  },
  error: {
    color: '#FF5A5F',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
  },
  altLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
  },
  altLinkText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
  },
  bioWrap: {
    alignItems: 'center',
  },
  bioButton: {
    width: 100,
    height: 100,
    borderRadius: Radius.xl,
    backgroundColor: 'rgba(255,46,138,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,46,138,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  fallbackWrap: {
    alignItems: 'center',
    width: '100%',
  },
  mailIconWrap: {
    width: 80,
    height: 80,
    borderRadius: Radius.xl,
    backgroundColor: 'rgba(255,46,138,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,46,138,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  inputWrap: {
    width: '100%',
    maxWidth: 320,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    overflow: 'hidden',
  },
  input: {
    color: '#fff',
    fontSize: FontSize.body,
    fontFamily: 'Inter-Regular',
    paddingVertical: 14,
    paddingHorizontal: Spacing.md,
  },
  signInBtn: {
    width: '100%',
    maxWidth: 320,
    borderRadius: Radius.pill,
    backgroundColor: '#FF2E8A',
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signInBtnText: {
    color: '#fff',
    fontSize: FontSize.body,
    fontFamily: 'Inter-SemiBold',
  },
});
