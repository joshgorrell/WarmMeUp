import React, { useState } from 'react';
import {
  View, StyleSheet, TouchableOpacity,
  KeyboardAvoidingView, Platform, ScrollView, Modal,
} from 'react-native';
import Constants from 'expo-constants';
import AppText from '@/components/AppText';
import AppTextInput from '@/components/AppTextInput';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '@/lib/supabase';
import { signInWithProvider, isOAuthSupported, assertNoEmailCollision, EmailCollisionError } from '@/lib/oauth';
import { savePendingCode, loadPendingCode, clearPendingCode } from '@/lib/inviteCode';
import { friendlyAuthError } from '@/lib/authError';
import { completePendingJoin, isDefinitiveJoinFailure } from '@/lib/coupleJoin';
import WarmupBrand from '@/components/WarmupBrand';
import PrimaryButton from '@/components/PrimaryButton';
import GoogleIcon from '@/components/icons/GoogleIcon';
import AppleIcon from '@/components/icons/AppleIcon';
import * as AppleAuthentication from 'expo-apple-authentication';
import { FontSize, Spacing, Radius } from '@/constants/theme';
import { useLayout } from '@/hooks/useLayout';
import { logger } from '@/lib/logger';

// Shared control geometry — all form controls on this screen use these values
const CONTROL_HEIGHT = 56;
const CONTROL_RADIUS = Radius.lg; // 22 — consistent across all controls
const CONTROL_WIDTH = '100%';
const PLACEHOLDER_COLOR = 'rgba(255,255,255,0.38)';

export default function LoginScreen() {
  const router = useRouter();
  const { pendingCode, prefilledCode } = useLocalSearchParams<{ pendingCode?: string; prefilledCode?: string }>();
  const codeToPreserve = (pendingCode || prefilledCode || '').toUpperCase().trim();
  const { width, height, isTablet, contentMaxWidth } = useLayout();
  const isShortScreen = height < 700;
  const logoSize = Math.min(Math.round(width * 0.18), 72);
  const sloganWidth = Math.min(Math.round(width * 0.52), 210);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<'apple' | 'google' | null>(null);
  const [error, setError] = useState('');
  const [helpVisible, setHelpVisible] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setError('Please enter your email and password.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const { data, error: err } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (err) throw err;

      const storedCode = await loadPendingCode();
      const codeToRedeem = codeToPreserve || storedCode || '';
      if (codeToRedeem && data.user) {
        const result = await completePendingJoin(codeToRedeem);
        if (result.ok) {
          await clearPendingCode();
          router.replace({
            pathname: '/(auth)/paired-celebration',
            params: { partnerName: result.inviterName || '', partnerAvatar: result.inviterAvatar || '' },
          });
          return;
        }
        if (isDefinitiveJoinFailure(result.reason)) await clearPendingCode();
      }

      router.replace('/transition');
    } catch (e: unknown) {
      logger.warn('[Login] sign-in failed', { errorId: 'login_failed' });
      setError(friendlyAuthError(e));
    } finally {
      setLoading(false);
    }
  };

  const handleOAuth = async (provider: 'apple' | 'google') => {
    setError('');
    setOauthLoading(provider);
    try {
      if (codeToPreserve) await savePendingCode(codeToPreserve);
      const session = await signInWithProvider(provider);
      if (!session) return;

      const userId = session.user?.id;
      if (userId) {
        try {
          await assertNoEmailCollision();
        } catch (e) {
          if (e instanceof EmailCollisionError) {
            setError(e.message);
            return;
          }
          throw e;
        }

        const { data: existing } = await supabase
          .from('profiles')
          .select('first_name, last_name, date_of_birth, age_verified_at, tos_accepted_at, onboarding_completed_at')
          .eq('id', userId)
          .maybeSingle();

        const registrationComplete = !!(
          existing?.first_name &&
          existing?.last_name &&
          existing?.date_of_birth &&
          existing?.age_verified_at &&
          existing?.tos_accepted_at
        );

        if (!registrationComplete) {
          const redirectParams: Record<string, string> = { oauthComplete: '1' };
          if (codeToPreserve) redirectParams.pendingCode = codeToPreserve;
          router.replace({ pathname: '/(auth)/register', params: redirectParams });
        } else if (!existing?.onboarding_completed_at) {
          const redirectParams: Record<string, string> = { oauthComplete: '1' };
          if (codeToPreserve) redirectParams.pendingCode = codeToPreserve;
          router.replace({ pathname: '/(auth)/onboarding', params: redirectParams });
        } else {
          const storedCode = await loadPendingCode();
          const codeToRedeem = codeToPreserve || storedCode || '';
          if (codeToRedeem) {
            const result = await completePendingJoin(codeToRedeem);
            if (result.ok) {
              await clearPendingCode();
              router.replace({
                pathname: '/(auth)/paired-celebration',
                params: { partnerName: result.inviterName || '', partnerAvatar: result.inviterAvatar || '' },
              });
              return;
            }
            if (isDefinitiveJoinFailure(result.reason)) {
              await clearPendingCode();
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

  const panelPad = isShortScreen ? 16 : 20;
  const panelGap = isShortScreen ? 10 : 12;
  const brandGap = isShortScreen ? 12 : 16;

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
          <TouchableOpacity
            style={[styles.brandBlock, { marginBottom: brandGap }]}
            activeOpacity={1}
          >
            <WarmupBrand logoSize={logoSize} sloganWidth={sloganWidth} showTagline taglineMarginTop={4} />
          </TouchableOpacity>

          {/* Sign-in panel */}
          <View style={[styles.panel, { padding: panelPad, gap: panelGap }]}>
            {/* Email field */}
            <View style={styles.field}>
              <AppText style={styles.label}>Email</AppText>
              <AppTextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="your@email.com"
                placeholderTextColor={PLACEHOLDER_COLOR}
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
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="Your password"
                placeholderTextColor={PLACEHOLDER_COLOR}
                secureTextEntry
              />
            </View>

            {error ? <AppText style={styles.error}>{error}</AppText> : null}

            <PrimaryButton
              label="Sign In"
              onPress={handleLogin}
              loading={loading || oauthLoading !== null}
              style={styles.primaryBtn}
              height={CONTROL_HEIGHT}
              borderRadius={CONTROL_RADIUS}
            />

            {/* Social sign-in */}
            {(showGoogle || showApple) && (
              <>
                <View style={styles.dividerRow}>
                  <View style={styles.dividerLine} />
                  <AppText style={styles.dividerText}>or continue with</AppText>
                  <View style={styles.dividerLine} />
                </View>

                <View style={styles.socialCol}>
                  {showApple && (
                    Platform.OS === 'ios' ? (
                      <AppleAuthentication.AppleAuthenticationButton
                        onPress={() => handleOAuth('apple')}
                        buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                        buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                        cornerRadius={CONTROL_RADIUS}
                        style={styles.appleNativeBtn}
                      />
                    ) : (
                      <TouchableOpacity
                        style={styles.appleBtn}
                        onPress={() => handleOAuth('apple')}
                        activeOpacity={0.88}
                        disabled={oauthLoading !== null || loading}
                      >
                        <AppleIcon color="#fff" size={18} />
                        <AppText style={styles.appleBtnText}>
                          {oauthLoading === 'apple' ? 'Signing in…' : 'Sign in with Apple'}
                        </AppText>
                      </TouchableOpacity>
                    )
                  )}

                  {showGoogle && (
                    <TouchableOpacity
                      style={styles.googleBtn}
                      onPress={() => handleOAuth('google')}
                      activeOpacity={0.88}
                      disabled={oauthLoading !== null || loading}
                    >
                      <GoogleIcon size={18} />
                      <AppText style={styles.googleBtnText}>
                        {oauthLoading === 'google' ? 'Signing in…' : 'Sign in with Google'}
                      </AppText>
                    </TouchableOpacity>
                  )}
                </View>
              </>
            )}
          </View>

          <TouchableOpacity
            style={[styles.footerLink, { marginTop: isShortScreen ? 8 : 12 }]}
            onPress={() => setHelpVisible(true)}
            activeOpacity={0.7}
          >
            <AppText style={styles.footerAccent}>Having trouble signing in?</AppText>
          </TouchableOpacity>

          <Modal visible={helpVisible} transparent animationType="fade" onRequestClose={() => setHelpVisible(false)}>
            <View style={styles.helpOverlay}>
              <View style={styles.helpCard}>
                <AppText style={styles.helpTitle}>Help signing in</AppText>
                <AppText style={styles.helpBody}>Check your email and password, then try again. If you recently changed your password, use the newest one. You can also close and reopen the app before trying again.</AppText>
                <AppText style={styles.helpBody}>If you still need help, contact support at support@warmmeup.app.</AppText>
                <AppText style={styles.helpMeta}>App version {Constants.expoConfig?.version ?? '1.7.0'}{Constants.expoConfig?.ios?.buildNumber ? ` (build ${Constants.expoConfig.ios.buildNumber})` : ''}</AppText>
                <TouchableOpacity style={styles.helpClose} onPress={() => setHelpVisible(false)} activeOpacity={0.8}>
                  <AppText style={styles.helpCloseText}>Return to login</AppText>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>

          {/* Footer */}
          <TouchableOpacity
            style={[styles.footerLink, { marginTop: isShortScreen ? 4 : 8 }]}
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
    paddingVertical: Spacing.xl,
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
    width: CONTROL_WIDTH,
    height: CONTROL_HEIGHT,
    backgroundColor: 'rgba(255,255,255,0.055)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    borderRadius: CONTROL_RADIUS,
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
  primaryBtn: {
    width: CONTROL_WIDTH,
    borderRadius: CONTROL_RADIUS,
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
  socialCol: {
    flexDirection: 'column',
    gap: Spacing.sm,
  },
  appleBtn: {
    width: CONTROL_WIDTH,
    height: CONTROL_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: CONTROL_RADIUS,
    borderWidth: 1,
    backgroundColor: '#1A1A1A',
    borderColor: 'rgba(255,255,255,0.14)',
  },
  appleBtnText: {
    color: '#fff',
    fontSize: FontSize.body,
    fontFamily: 'Inter-SemiBold',
  },
  appleNativeBtn: {
    width: CONTROL_WIDTH,
    height: CONTROL_HEIGHT,
  },
  googleBtn: {
    width: CONTROL_WIDTH,
    height: CONTROL_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: CONTROL_RADIUS,
    borderWidth: 1,
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
  helpOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  helpCard: {
    backgroundColor: '#171317',
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  helpTitle: {
    color: '#fff',
    fontSize: FontSize.lg,
    fontFamily: 'Inter-Bold',
  },
  helpBody: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: FontSize.body,
    lineHeight: 24,
    fontFamily: 'Inter-Regular',
  },
  helpMeta: {
    color: 'rgba(255,255,255,0.48)',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
  },
  helpClose: {
    backgroundColor: '#FF5A3D',
    borderRadius: Radius.pill,
    paddingVertical: 14,
    alignItems: 'center',
  },
  helpCloseText: {
    color: '#fff',
    fontSize: FontSize.body,
    fontFamily: 'Inter-SemiBold',
  },
});
