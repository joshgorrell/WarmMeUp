import React, { useCallback, useEffect, useRef, useState } from 'react';
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

// Module-level flag persists across remounts. Without this, every navigation to /unlock
// (e.g. from BackgroundLockManager) resets the ref and auto-fires a new Face ID prompt,
// creating an infinite biometric loop. Reset only on successful unlock or manual PIN switch.
let biometricAlreadyPrompted = false;

export default function UnlockScreen() {
  const router = useRouter();
  const { user, settings, unlockApp, isAuthenticatingRef } = useAuth();
  const { available: bioAvailable, biometricLabel, authenticate } = useBiometricAuth();
  const { width, height, isTablet, contentMaxWidth } = useLayout();
  const insets = useSafeAreaInsets();

  const loginMethod = settings?.login_method ?? 'password';

  const [mode, setMode] = useState<'biometric' | 'pin' | null>(null);
  const modeInitialised = useRef(false);

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
    unlockApp();
    router.replace('/transition');
  }, [unlockApp, router]);

  const tryBiometric = useCallback(async () => {
    if (!bioAvailable) {
      setMode('pin');
      return;
    }
    biometricAlreadyPrompted = true;
    isAuthenticatingRef.current = true;
    try {
      const result = await authenticate(`Unlock Warm Me Up`);
      if (result.success) {
        biometricAlreadyPrompted = false;
        proceed();
      } else {
        setMode('pin');
      }
    } finally {
      isAuthenticatingRef.current = false;
    }
  }, [bioAvailable, authenticate, proceed, isAuthenticatingRef]);

  useEffect(() => {
    if (modeInitialised.current || !settings) return;
    modeInitialised.current = true;
    const initial = settings.login_method === 'biometric' ? 'biometric' : 'pin';
    setMode(initial);
  }, [settings]);

  useEffect(() => {
    if (mode !== 'biometric') return;
    if (biometricAlreadyPrompted) return;
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

  const BiometricIcon = biometricLabel === 'Touch ID' ? Fingerprint : ScanFace;

  const centerStyle = isTablet
    ? { maxWidth: contentMaxWidth, alignSelf: 'center' as const, width: '100%' as const }
    : {};

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#07070A', '#0D0D12', '#151018']} style={StyleSheet.absoluteFill} />

      <View style={[styles.content, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }]}>
        <View style={[{ marginBottom: vMd }, centerStyle]}>
          <WarmupBrand logoSize={logoSize} showTagline={false} />
        </View>

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
              <TouchableOpacity style={styles.bioButton} onPress={tryBiometric} activeOpacity={0.75}>
                <BiometricIcon color="#FF2E8A" size={52} strokeWidth={1.5} />
              </TouchableOpacity>
              <AppText style={styles.title}>Unlock with {biometricLabel}</AppText>
              <AppText style={styles.sub}>Tap to authenticate</AppText>
              <TouchableOpacity style={styles.altLink} onPress={() => { biometricAlreadyPrompted = false; setMode('pin'); }} activeOpacity={0.7}>
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
                  <TouchableOpacity style={styles.altLink} onPress={tryBiometric} activeOpacity={0.7}>
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
