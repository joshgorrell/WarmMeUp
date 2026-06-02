import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import {
  View, StyleSheet, TouchableOpacity,
  Platform, Animated,
} from 'react-native';
import AppText from '@/components/AppText';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import { ScanFace, FingerprintPattern as Fingerprint, KeyRound } from 'lucide-react-native';
import WarmupBrand from '@/components/WarmupBrand';
import { FontSize, Spacing, Radius } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { useBiometricAuth } from '@/hooks/useBiometricAuth';
import { secureKey } from '@/lib/secureKey';
import { supabase } from '@/lib/supabase';
import { useLayout } from '@/hooks/useLayout';

const PAD = ['1','2','3','4','5','6','7','8','9','','0','⌫'];
const MAX_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 30;

// Module-level flag persists across remounts of the unlock screen within the same JS session.
// Set to true the moment the biometric prompt is triggered; only reset to false in proceed()
// after a successful unlock. This prevents BackgroundLockManager from navigating to /unlock
// and causing a re-mount that would auto-fire a second Face ID prompt.
let biometricAlreadyPrompted = false;

export default function UnlockScreen() {
  const router = useRouter();
  const { user, profile, settings, unlockApp, isAuthenticatingRef, debugModeEnabled } = useAuth();
  const { available: bioAvailable, biometricLabel, authenticate } = useBiometricAuth();
  const { width, height, isTablet, contentMaxWidth } = useLayout();
  const insets = useSafeAreaInsets();

  const loginMethod = settings?.login_method ?? 'password';

  const [mode, setMode] = useState<'biometric' | 'pin' | null>(null);
  // True once the mode has been set for this mount — prevents the settings useEffect
  // from re-running mode-init logic if settings state updates after initial load.
  const modeInitialised = useRef(false);
  // True once tryBiometric() has been called on this mount — prevents the mode useEffect
  // from auto-firing a second prompt if mode changes while still on the same screen mount.
  const biometricAttemptedThisMount = useRef(false);

  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [pinMissing, setPinMissing] = useState(false);

  const shakeAnim = useRef(new Animated.Value(0)).current;

  const vXs = Math.round(height * 0.012);
  const vSm = Math.round(height * 0.02);
  const vMd = Math.round(height * 0.03);
  const logoSize = Math.min(Math.round(width * 0.16), 64);

  const padWidth = Math.min(width - Spacing.xl * 2, 300);
  const keyGap = Spacing.sm;
  const keySize = (padWidth - keyGap * 2) / 3;
  const keyHeight = Math.min(Math.round(keySize * 0.78), Math.round(height * 0.075));

  useEffect(() => {
    if (!lockedUntil) return;
    const tick = setInterval(() => {
      const remaining = Math.ceil((lockedUntil - Date.now()) / 1000);
      if (remaining <= 0) {
        setLockedUntil(null);
        setCountdown(0);
        setAttempts(0);
        clearInterval(tick);
      } else {
        setCountdown(remaining);
      }
    }, 500);
    return () => clearInterval(tick);
  }, [lockedUntil]);

  const shake = useCallback(() => {
    shakeAnim.setValue(0);
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 6, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -6, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  }, [shakeAnim]);

  const proceed = useCallback(() => {
    console.log('[UNLOCK SUCCESS]', {
      userId: user?.id,
      loginMethod: settings?.login_method,
      timestamp: Date.now(),
    });
    // Reset the module-level flag so the NEXT time unlock is required, Face ID auto-prompts correctly.
    biometricAlreadyPrompted = false;
    // Block BackgroundLockManager from racing the navigation to /transition.
    isAuthenticatingRef.current = true;
    unlockApp();
    router.replace('/transition');
    setTimeout(() => { isAuthenticatingRef.current = false; }, 800);
  }, [unlockApp, router, isAuthenticatingRef, user, settings]);

  const tryBiometric = useCallback(async () => {
    if (!bioAvailable) {
      setMode('pin');
      return;
    }
    // Mark as attempted — both flags must be set before the async call so that any
    // re-render triggered during the prompt does not fire a second prompt.
    biometricAlreadyPrompted = true;
    biometricAttemptedThisMount.current = true;
    isAuthenticatingRef.current = true;
    try {
      const result = await authenticate(`Unlock Warm Me Up`);
      if (result.success) {
        proceed(); // proceed() resets biometricAlreadyPrompted for the next lock cycle
      } else {
        // User cancelled or failed — fall through to PIN.
        // Do NOT reset biometricAlreadyPrompted: require an explicit tap to retry.
        isAuthenticatingRef.current = false;
        setMode('pin');
      }
    } catch {
      isAuthenticatingRef.current = false;
      setMode('pin');
    }
  }, [bioAvailable, authenticate, proceed, isAuthenticatingRef]);

  // One-shot: set the initial mode when settings first become available.
  useEffect(() => {
    if (modeInitialised.current || !settings) return;
    modeInitialised.current = true;
    const method = settings.login_method ?? 'password';
    const lockAfter = settings.lock_after_seconds ?? null;
    console.log('[unlock] settings loaded, login_method:', method, 'lock_after_seconds:', lockAfter);

    // lock_after_seconds = -1 means "never lock" — proceed immediately if we land here.
    if (lockAfter !== null && lockAfter < 0) {
      proceed();
      return;
    }
    if (method === 'password') {
      // Should never land here for password users, but if we do, proceed immediately.
      proceed();
      return;
    }
    setMode(method === 'biometric' ? 'biometric' : 'pin');
  }, [settings]);

  // Auto-trigger biometric prompt exactly once per screen mount.
  // Three guards must all pass:
  //   1. mode === 'biometric'
  //   2. biometricAlreadyPrompted === false (module-level: guards against re-mounts)
  //   3. biometricAttemptedThisMount.current === false (mount-level: guards against
  //      this effect re-running within the same mount if dependencies update)
  useEffect(() => {
    if (mode !== 'biometric') return;
    if (biometricAlreadyPrompted) return;
    if (biometricAttemptedThisMount.current) return;
    tryBiometric();
  }, [mode, tryBiometric]);

  const checkPin = useCallback(async (entered: string) => {
    let userId = user?.id;
    if (!userId) {
      const { data: { session: liveSession } } = await supabase.auth.getSession();
      userId = liveSession?.user?.id;
    }

    if (Platform.OS === 'web') {
      const stored = userId && typeof window !== 'undefined'
        ? window.localStorage.getItem(secureKey('warmup_pin', userId))
        : null;
      if (stored === null) {
        setPinMissing(true);
        setPin('');
        return;
      }
      if (entered === stored) { proceed(); } else { handleWrongPin(); }
      return;
    }
    let stored: string | null = null;
    try {
      stored = userId ? await SecureStore.getItemAsync(secureKey('warmup_pin', userId)) : null;
    } catch {
      setPinMissing(true);
      setPin('');
      return;
    }
    if (stored === null) {
      setPinMissing(true);
      setPin('');
      return;
    }
    if (entered === stored) { proceed(); } else { handleWrongPin(); }
  }, [user, proceed]);

  const handleWrongPin = () => {
    const next = attempts + 1;
    setAttempts(next);
    shake();
    setPin('');
    if (next >= MAX_ATTEMPTS) {
      const until = Date.now() + LOCKOUT_SECONDS * 1000;
      setLockedUntil(until);
      setError(`Too many attempts. Try again in ${LOCKOUT_SECONDS}s.`);
    } else {
      setError(`Incorrect PIN. ${MAX_ATTEMPTS - next} attempt${MAX_ATTEMPTS - next === 1 ? '' : 's'} remaining.`);
      setTimeout(() => setError(''), 2500);
    }
  };

  const handleKey = useCallback((k: string) => {
    if (lockedUntil) return;
    if (k === '⌫') {
      setPin(prev => prev.slice(0, -1));
      return;
    }
    if (k === '') return;
    if (pin.length >= 4) return;
    const next = pin + k;
    setPin(next);
    if (next.length === 4) {
      setTimeout(() => checkPin(next), 80);
    }
  }, [pin, lockedUntil, checkPin]);

  const goToPassword = () => {
    router.replace('/(auth)/login');
  };

  // Allow the user to manually retry biometric after a cancel or failure.
  const handleBiometricRetry = useCallback(() => {
    biometricAlreadyPrompted = false;
    biometricAttemptedThisMount.current = false;
    tryBiometric();
  }, [tryBiometric]);

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
    <View style={styles.container}>
      <LinearGradient colors={['#07070A', '#0D0D12', '#151018']} style={StyleSheet.absoluteFill} />

      <View style={[styles.content, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity onPress={handleDebugTap} activeOpacity={1} style={[{ marginBottom: vMd }, centerStyle]}>
          <WarmupBrand logoSize={logoSize} showTagline={false} />
        </TouchableOpacity>

        <View style={centerStyle}>
          {pinMissing ? (
            <View style={[styles.bioWrap, { gap: vSm }]}>
              <KeyRound color="rgba(255,179,71,0.85)" size={48} strokeWidth={1.5} />
              <AppText style={styles.title}>PIN Not Found</AppText>
              <AppText style={[styles.sub, { marginBottom: vSm, paddingHorizontal: Spacing.md }]}>
                No PIN is saved on this device. Sign in with your password to set one up.
              </AppText>
              <TouchableOpacity style={styles.setupPinBtn} onPress={goToPassword} activeOpacity={0.8}>
                <AppText style={styles.setupPinBtnText}>Sign In with Password</AppText>
              </TouchableOpacity>
            </View>
          ) : mode === null ? null : mode === 'biometric' && bioAvailable ? (
            <View style={[styles.bioWrap, { gap: vSm }]}>
              <TouchableOpacity style={styles.bioButton} onPress={handleBiometricRetry} activeOpacity={0.75}>
                <BiometricIcon color="#FF2E8A" size={52} strokeWidth={1.5} />
              </TouchableOpacity>
              <AppText style={styles.title}>Unlock with {biometricLabel}</AppText>
              <AppText style={styles.sub}>Tap to authenticate</AppText>
              <TouchableOpacity
                style={styles.altLink}
                onPress={() => {
                  biometricAlreadyPrompted = false;
                  biometricAttemptedThisMount.current = false;
                  setMode('pin');
                }}
                activeOpacity={0.7}
              >
                <KeyRound color="rgba(255,255,255,0.4)" size={14} />
                <AppText style={styles.altLinkText}>Use PIN instead</AppText>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <AppText style={styles.title}>Enter PIN</AppText>
              <AppText style={[styles.sub, { marginBottom: vSm }]}>Enter your 4-digit Warm Me Up PIN</AppText>

              <Animated.View style={[styles.dots, { marginBottom: vSm, transform: [{ translateX: shakeAnim }] }]}>
                {Array.from({ length: 4 }).map((_, i) => (
                  <View
                    key={i}
                    style={[styles.dot, { backgroundColor: i < pin.length ? '#FF2E8A' : 'rgba(255,255,255,0.15)' }]}
                  />
                ))}
              </Animated.View>

              {error ? (
                <AppText style={[styles.error, { marginBottom: vXs }]}>
                  {lockedUntil ? `Too many attempts. Try again in ${countdown}s.` : error}
                </AppText>
              ) : null}

              <View style={[styles.pad, { width: padWidth, gap: keyGap, opacity: lockedUntil ? 0.35 : 1 }]}>
                {PAD.map((k, i) => (
                  <TouchableOpacity
                    key={i}
                    style={[styles.key, { width: keySize, height: keyHeight }, k === '' && styles.keyEmpty]}
                    onPress={() => handleKey(k)}
                    activeOpacity={k === '' ? 1 : 0.6}
                    disabled={k === '' || !!lockedUntil}
                  >
                    <AppText style={[styles.keyText, k === '⌫' && styles.keyDelete]}>{k}</AppText>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={[styles.footerLinks, { marginTop: vSm }]}>
                {loginMethod === 'biometric' && bioAvailable && (
                  <TouchableOpacity style={styles.altLink} onPress={handleBiometricRetry} activeOpacity={0.7}>
                    <BiometricIcon color="rgba(255,255,255,0.4)" size={14} />
                    <AppText style={styles.altLinkText}>Use {biometricLabel}</AppText>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.altLink} onPress={goToPassword} activeOpacity={0.7}>
                  <KeyRound color="rgba(255,255,255,0.4)" size={14} />
                  <AppText style={styles.altLinkText}>Forgot PIN? Use password</AppText>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </View>

    </View>
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
  dots: {
    flexDirection: 'row',
    gap: Spacing.md,
    justifyContent: 'center',
  },
  dot: { width: 14, height: 14, borderRadius: 7 },
  error: {
    color: '#FF5A5F',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
  },
  pad: { flexDirection: 'row', flexWrap: 'wrap' },
  key: {
    borderRadius: Radius.xl,
    backgroundColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  keyEmpty: { backgroundColor: 'transparent', borderColor: 'transparent' },
  keyText: { color: '#fff', fontSize: FontSize.xxl, fontFamily: 'Inter-Medium' },
  keyDelete: { fontSize: FontSize.xl },
  footerLinks: {
    gap: Spacing.sm,
    alignItems: 'center',
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
  setupPinBtn: {
    borderRadius: Radius.pill,
    backgroundColor: '#FF5A3D',
    paddingVertical: 14,
    paddingHorizontal: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  setupPinBtnText: {
    color: '#fff',
    fontSize: FontSize.body,
    fontFamily: 'Inter-SemiBold',
  },
});
