import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import AppText from '@/components/AppText';
import AppTextInput from '@/components/AppTextInput';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, Mail, RefreshCw, Check } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { FontSize, Spacing, Radius } from '@/constants/theme';
import { useLayout } from '@/hooks/useLayout';
import { clearPendingCode, loadPendingCode } from '@/lib/inviteCode';
import { completePendingJoin } from '@/lib/coupleJoin';
import { friendlyAuthError } from '@/lib/authError';
import { useAuth } from '@/context/AuthContext';
import { logger } from '@/lib/logger';

const POLL_INTERVAL_MS = 3000;

export default function VerifyEmailScreen() {
  const router = useRouter();
  const { email, pendingCode } = useLocalSearchParams<{ email?: string; pendingCode?: string }>();
  const { width, height, isTablet, contentMaxWidth } = useLayout();
  const insets = useSafeAreaInsets();
  const { refreshProfile } = useAuth();

  const headingSize = Math.min(Math.round(width * 0.076), 30);
  const vMd = Math.round(height * 0.03);
  const vSm = Math.round(height * 0.02);

  const [otp, setOtp] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [joining, setJoining] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const joinedRef = useRef(false);

  const displayEmail = email || 'your email';

  // Poll for email confirmation — Supabase auto-refreshes the session when the
  // user clicks the confirmation link. onAuthStateChange fires USER_UPDATED,
  // but we also poll getUser() as a fallback in case the event is missed.
  useEffect(() => {
    let cancelled = false;

    const checkConfirmed = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled) return;
      if (user?.email_confirmed_at) {
        setConfirmed(true);
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
        await handleConfirmed(user.id);
      }
    };

    checkConfirmed();
    pollRef.current = setInterval(checkConfirmed, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleConfirmed = useCallback(async (userId: string) => {
    if (joinedRef.current) return;
    joinedRef.current = true;

    refreshProfile().catch(() => {});

    const code = pendingCode || (await loadPendingCode()) || '';

    if (code) {
      setJoining(true);
      try {
        const result = await completePendingJoin(code);
        await clearPendingCode();
        if (result.ok) {
          router.replace({
            pathname: '/(auth)/paired-celebration',
            params: { partnerName: result.inviterName || '' },
          });
          return;
        }
        // Join failed — don't block the user. Send them to onboarding.
        logger.log('[verify-email] join failed:', result.reason);
      } catch (e: any) {
        logger.log('[verify-email] join error:', e?.message);
      } finally {
        setJoining(false);
      }
    }

    router.replace('/(auth)/onboarding');
  }, [pendingCode, refreshProfile, router]);

  const handleVerifyOtp = async () => {
    if (!otp.trim() || verifying) return;
    setError('');
    setVerifying(true);
    try {
      const { data, error: verifyError } = await supabase.auth.verifyOtp({
        email: displayEmail,
        token: otp.trim(),
        type: 'email_confirmation',
      });
      if (verifyError) throw verifyError;
      if (data.user?.email_confirmed_at) {
        setConfirmed(true);
        await handleConfirmed(data.user.id);
      }
    } catch (e: unknown) {
      setError(friendlyAuthError(e));
    } finally {
      setVerifying(false);
    }
  };

  const handleResend = async () => {
    if (resending) return;
    setResending(true);
    setError('');
    try {
      const { error: resendError } = await supabase.auth.resend({
        type: 'signup',
        email: displayEmail,
      });
      if (resendError) throw resendError;
    } catch (e: unknown) {
      setError(friendlyAuthError(e));
    } finally {
      setResending(false);
    }
  };

  const centerStyle = isTablet
    ? { maxWidth: contentMaxWidth, alignSelf: 'center' as const, width: '100%' as const }
    : {};

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <LinearGradient
        colors={['#060406', '#0A060A', '#0E080E']}
        style={StyleSheet.absoluteFill}
      />

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: vMd + insets.top, paddingBottom: Math.max(insets.bottom, vMd) + vMd }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={isTablet ? [styles.innerWrap, centerStyle] : styles.innerWrap}>
          <View style={[styles.headerRow, { marginBottom: vSm }]}>
            <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
              <ChevronLeft color="rgba(255,255,255,0.75)" size={20} strokeWidth={2.2} />
            </TouchableOpacity>
          </View>

          <View style={styles.iconWrap}>
            <LinearGradient
              colors={['rgba(255,122,69,0.18)', 'rgba(255,46,138,0.12)']}
              style={styles.iconCircle}
            >
              {confirmed ? (
                <Check color="#4CAF50" size={28} strokeWidth={2.2} />
              ) : (
                <Mail color="#FF8A3D" size={28} strokeWidth={1.8} />
              )}
            </LinearGradient>
          </View>

          <AppText style={[styles.heading, { fontSize: headingSize, marginBottom: vSm }]}>
            {confirmed ? 'Email confirmed!' : 'Check your email'}
          </AppText>

          <AppText style={[styles.sub, { marginBottom: vMd }]}>
            {confirmed
              ? joining
                ? 'Connecting you with your partner...'
                : 'Setting up your account...'
              : `We sent a confirmation link to ${displayEmail}. Tap the link in the email to verify your account.`}
          </AppText>

          {joining && (
            <View style={styles.joiningRow}>
              <ActivityIndicator color="#FF8A3D" size="small" />
              <AppText style={styles.joiningText}>Completing your connection...</AppText>
            </View>
          )}

          {!confirmed && !joining && (
            <>
              <AppText style={styles.orText}>Or enter the 6-digit code from the email:</AppText>

              <View style={styles.otpRow}>
                <AppTextInput
                  style={styles.otpInput}
                  value={otp}
                  onChangeText={(t) => { setOtp(t.replace(/[^0-9]/g, '').slice(0, 6)); setError(''); }}
                  placeholder="000000"
                  placeholderTextColor="rgba(255,255,255,0.20)"
                  keyboardType="number-pad"
                  autoCorrect={false}
                  autoComplete="off"
                  maxLength={6}
                  textAlign="center"
                />
              </View>

              {error ? <AppText style={styles.error}>{error}</AppText> : null}

              <TouchableOpacity
                style={[styles.verifyBtn, !otp.trim() && styles.verifyBtnDisabled]}
                onPress={handleVerifyOtp}
                activeOpacity={0.85}
                disabled={!otp.trim() || verifying}
              >
                <LinearGradient
                  colors={['#FF7B00', '#FF5A3D', '#FF2E8A']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.verifyGrad}
                >
                  {verifying ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <AppText style={styles.verifyLabel}>Verify</AppText>
                  )}
                </LinearGradient>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.resendBtn}
                onPress={handleResend}
                activeOpacity={0.7}
                disabled={resending}
              >
                {resending ? (
                  <ActivityIndicator color="rgba(255,255,255,0.4)" size="small" />
                ) : (
                  <>
                    <RefreshCw color="rgba(255,255,255,0.4)" size={14} strokeWidth={2} />
                    <AppText style={styles.resendText}>Resend email</AppText>
                  </>
                )}
              </TouchableOpacity>
            </>
          )}

          <TouchableOpacity
            style={styles.skipRow}
            onPress={() => router.replace('/(auth)/onboarding')}
            activeOpacity={0.6}
          >
            <AppText style={styles.skipText}>Skip for now</AppText>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: Spacing.xl,
  },
  innerWrap: { flex: 1 },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  backBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  iconWrap: { alignItems: 'center', marginBottom: Spacing.lg },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,138,61,0.25)',
  },
  heading: {
    color: '#fff',
    fontFamily: 'Inter-Bold',
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  sub: {
    color: 'rgba(255,255,255,0.50)',
    fontSize: FontSize.body,
    fontFamily: 'Inter-Regular',
    lineHeight: 24,
    textAlign: 'center',
  },
  orText: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  otpRow: { marginBottom: Spacing.md },
  otpInput: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    borderRadius: Radius.lg,
    color: '#fff',
    fontSize: 24,
    fontFamily: 'Inter-Bold',
    letterSpacing: 8,
    paddingVertical: 16,
  },
  error: {
    color: '#FF5A5F',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  verifyBtn: {
    borderRadius: Radius.pill,
    overflow: 'hidden',
    shadowColor: '#FF5A3D',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.40,
    shadowRadius: 16,
    elevation: 8,
    marginBottom: Spacing.md,
  },
  verifyBtnDisabled: {
    shadowOpacity: 0,
    elevation: 0,
  },
  verifyGrad: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.pill,
  },
  verifyLabel: {
    color: '#fff',
    fontSize: FontSize.body,
    fontFamily: 'Inter-Bold',
  },
  resendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: Spacing.sm,
  },
  resendText: {
    color: 'rgba(255,255,255,0.40)',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
  },
  joiningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginBottom: Spacing.md,
  },
  joiningText: {
    color: 'rgba(255,138,61,0.80)',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Medium',
  },
  skipRow: {
    alignItems: 'center',
    paddingVertical: Spacing.lg,
    marginTop: Spacing.sm,
  },
  skipText: {
    color: 'rgba(255,255,255,0.30)',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
    textDecorationLine: 'underline',
    textDecorationColor: 'rgba(255,255,255,0.20)',
  },
});
