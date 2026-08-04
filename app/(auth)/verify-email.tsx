import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import AppText from '@/components/AppText';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Mail, RefreshCw } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { FontSize, Spacing, Radius } from '@/constants/theme';
import WarmupBrand from '@/components/WarmupBrand';
import { useLayout } from '@/hooks/useLayout';
import { completePendingJoin } from '@/lib/coupleJoin';
import { loadPendingCode, clearPendingCode } from '@/lib/inviteCode';
import { useAuth } from '@/context/AuthContext';

export default function VerifyEmailScreen() {
  const router = useRouter();
  const { pendingCode, email } = useLocalSearchParams<{ pendingCode?: string; email?: string }>();
  const { width, height, isTablet, contentMaxWidth } = useLayout();
  const insets = useSafeAreaInsets();
  const { refreshSubscription } = useAuth();

  const [checking, setChecking] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState('');
  const [resent, setResent] = useState(false);

  const logoSize = Math.min(Math.round(width * 0.14), 56);
  const vMd = Math.round(height * 0.03);

  const handleContinue = async () => {
    if (checking) return;
    setChecking(true);
    setError('');
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        setError('Connection error. Check your network and try again.');
        return;
      }
      if (!user.email_confirmed_at) {
        setError('Email not verified yet. Please check your inbox and click the link, then try again.');
        return;
      }

      // Email is confirmed — handle pending invite code before routing
      const code = pendingCode || (await loadPendingCode()) || '';
      if (code) {
        const result = await completePendingJoin(code);
        if (result.ok) {
          await clearPendingCode();
          router.replace({
            pathname: '/(auth)/pair',
            params: { prefilledCode: code },
          });
          return;
        }
        await clearPendingCode();
        const msg =
          result.reason === 'self' ? "You can't use your own invite code." :
          result.reason === 'already_connected' ? "You're already connected to a partner." :
          result.reason === 'not_found' ? "Invite code not found. You can pair from the app later." :
          result.reason === 'rate_limited' ? 'Too many attempts. You can pair from the app later.' :
          'Something went wrong connecting you. You can pair from the app later.';
        setError(msg);
        setTimeout(() => router.replace('/(auth)/onboarding'), 3000);
        return;
      }

      router.replace('/(auth)/onboarding');
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setChecking(false);
    }
  };

  const handleResend = async () => {
    if (resending || !email) return;
    setResending(true);
    setResent(false);
    setError('');
    try {
      const { error: resendError } = await supabase.auth.resend({ type: 'signup', email });
      if (resendError) {
        setError('Could not resend. Please try again shortly.');
      } else {
        setResent(true);
      }
    } catch {
      setError('Could not resend. Please try again shortly.');
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

      <View style={[styles.content, { paddingTop: insets.top + vMd, paddingBottom: Math.max(insets.bottom, vMd) }]}>
        <View style={[centerStyle, styles.inner]}>
          <View style={[styles.brandWrap, { marginBottom: vMd }]}>
            <WarmupBrand logoSize={logoSize} showTagline={false} />
          </View>

          <View style={styles.iconWrap}>
            <Mail color="#FF7A45" size={48} strokeWidth={1.5} />
          </View>

          <AppText style={styles.heading}>Check your inbox</AppText>
          <AppText style={styles.sub}>
            We sent a verification link to{'\n'}
            {email ? <AppText style={styles.emailHighlight}>{email}</AppText> : 'your email address'}.
            {'\n'}Click the link, then come back here.
          </AppText>

          {error ? <AppText style={styles.error}>{error}</AppText> : null}
          {resent ? <AppText style={styles.success}>Verification email resent.</AppText> : null}

          <TouchableOpacity
            style={styles.continueBtn}
            onPress={handleContinue}
            activeOpacity={0.85}
            disabled={checking}
          >
            <LinearGradient
              colors={['#FF7B00', '#FF5A3D', '#FF2E8A']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.continueGrad}
            >
              <AppText style={styles.continueLabel}>
                {checking ? 'Checking…' : "I've Verified — Continue"}
              </AppText>
            </LinearGradient>
          </TouchableOpacity>

          {email && (
            <TouchableOpacity
              style={styles.resendRow}
              onPress={handleResend}
              activeOpacity={0.7}
              disabled={resending}
            >
              <RefreshCw color="rgba(255,255,255,0.40)" size={14} />
              <AppText style={styles.resendText}>
                {resending ? 'Resending…' : "Resend verification email"}
              </AppText>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.signInRow}
            onPress={() => router.replace('/(auth)/login')}
            activeOpacity={0.7}
          >
            <AppText style={styles.signInText}>
              Wrong account?{'  '}
              <AppText style={styles.signInLink}>Sign In</AppText>
            </AppText>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.xl,
    justifyContent: 'center',
  },
  inner: {
    alignItems: 'center',
  },
  brandWrap: {
    alignItems: 'center',
  },
  iconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(255,122,69,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,122,69,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  heading: {
    color: '#fff',
    fontSize: FontSize.h1,
    fontFamily: 'Inter-Bold',
    letterSpacing: -0.5,
    textAlign: 'center',
    marginBottom: 12,
  },
  sub: {
    color: 'rgba(255,255,255,0.50)',
    fontSize: FontSize.body,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 28,
  },
  emailHighlight: {
    color: 'rgba(255,255,255,0.80)',
    fontFamily: 'Inter-SemiBold',
  },
  error: {
    color: '#FF5A5F',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    marginBottom: 16,
    paddingHorizontal: Spacing.md,
  },
  success: {
    color: '#4CAF50',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    marginBottom: 16,
  },
  continueBtn: {
    width: '100%',
    borderRadius: Radius.pill,
    overflow: 'hidden',
    shadowColor: '#FF5000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 18,
    elevation: 10,
    marginBottom: 16,
  },
  continueGrad: {
    alignItems: 'center',
    paddingVertical: 17,
    borderRadius: Radius.pill,
  },
  continueLabel: {
    color: '#fff',
    fontSize: FontSize.lg,
    fontFamily: 'Inter-Bold',
    letterSpacing: 0.3,
  },
  resendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    marginBottom: 8,
  },
  resendText: {
    color: 'rgba(255,255,255,0.40)',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
  },
  signInRow: {
    alignItems: 'center',
    paddingVertical: 6,
  },
  signInText: {
    color: 'rgba(255,255,255,0.36)',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
  },
  signInLink: {
    color: '#FF7A45',
    fontFamily: 'Inter-SemiBold',
  },
});
