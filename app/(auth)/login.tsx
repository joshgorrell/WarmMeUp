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

const V_SM = 16;
const V_MD = 24;
const INPUT_PAD = 14;

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
      // Persist code before OAuth redirect — app may restart during the flow.
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
          .select('id')
          .eq('id', userId)
          .maybeSingle();
        if (!existing) {
          // New OAuth user — route through register so they get the name/avatar steps.
          const redirectParams: Record<string, string> = { oauthComplete: '1' };
          if (codeToPreserve) redirectParams.pendingCode = codeToPreserve;
          router.replace({ pathname: '/(auth)/register', params: redirectParams });
        } else {
          // Existing user signing in — check for stored or param code to redeem.
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
            style={[styles.brandBlock, { marginBottom: V_MD }]}
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
                    Platform.OS === 'ios' ? (
                      <AppleAuthentication.AppleAuthenticationButton
                        onPress={() => handleOAuth('apple')}
                        buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                        buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                        cornerRadius={Radius.lg}
                        style={styles.appleNativeBtn}
                      />
                    ) : (
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
                    )
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

          <TouchableOpacity
            style={[styles.footerLink, { marginTop: V_SM }]}
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
  appleNativeBtn: {
    flex: 1,
    height: 48,
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
