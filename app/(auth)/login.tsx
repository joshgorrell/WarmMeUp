import React, { useState, useRef, useEffect } from 'react';
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
import WarmupBrand from '@/components/WarmupBrand';
import PrimaryButton from '@/components/PrimaryButton';
import AppleIcon from '@/components/icons/AppleIcon';
import GoogleIcon from '@/components/icons/GoogleIcon';
import { FontSize, Spacing, Radius } from '@/constants/theme';
import { useLayout } from '@/hooks/useLayout';

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

  useEffect(() => {
    const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'MISSING';
    const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? 'MISSING';
    console.log('[LoginScreen] SUPABASE_URL:', url);
    console.log('[LoginScreen] ANON_KEY_PREFIX_25:', key.slice(0, 25));
    console.log('[LoginScreen] ANON_KEY_LENGTH:', key.length);
  }, []);

  // Hidden 5-tap logo trigger — opens debug screen without auth
  const logoTapCount = useRef(0);
  const logoTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleLogoTap = () => {
    logoTapCount.current += 1;
    if (logoTapTimer.current) clearTimeout(logoTapTimer.current);
    if (logoTapCount.current >= 5) {
      logoTapCount.current = 0;
      router.push('/debug');
      return;
    }
    logoTapTimer.current = setTimeout(() => { logoTapCount.current = 0; }, 3000);
  };

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setError('Please enter your email and password.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      // Capture auth-client internals immediately before the call and persist
      // them so the debug screen shows what was present at attempt time.
      const authInternal = supabase.auth as any;
      const authHeaders: Record<string, string> = authInternal?.headers ?? {};
      const diag = getSupabaseDiagnostics();
      const attemptPayload = JSON.stringify({
        attemptAt: new Date().toISOString(),
        clientSource: 'supabase (shared lib/supabase.ts)',
        clientUrl: authInternal?.url ?? 'UNKNOWN',
        hasAnonKey: Boolean(authHeaders?.apikey),
        anonKeyLength: (authHeaders?.apikey ?? '').length,
        authHeaderKeys: Object.keys(authHeaders).join(', ') || '(none)',
        diagClientHasAnonKey: diag.clientHasAnonKey,
        diagClientAnonKeyLength: diag.clientAnonKeyLength,
        diagSourcesMatch: diag.sourcesMatch,
      });
      await SecureStore.setItemAsync('debug_last_login_attempt', attemptPayload).catch(() => {});
      console.log('[Login] attempt recorded', attemptPayload);
      console.log('[Login] signInWithPassword → email:', email.trim(), 'url:', process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'MISSING', 'keyLen:', (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '').length);

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
        SecureStore.setItemAsync('debug_last_auth_error', errPayload).catch(() => {});
        throw err;
      }
      console.log('[Login] signInWithPassword success', { userId: data.user?.id ?? null });

      // After sign-in, check for a stored pending invite code (survives app restarts).
      // Route-param code takes priority over stored code.
      const storedCode = await loadPendingCode();
      const codeToRedeem = codeToPreserve || storedCode || '';

      if (codeToRedeem && data.user) {
        const result = await completePendingJoin(data.user.id, codeToRedeem);
        await clearPendingCode();
        if (result.ok) {
          const { data: sessionData } = await supabase.auth.getSession();
          const token = sessionData?.session?.access_token;
          if (token) {
            fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/notify-partner`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
              body: JSON.stringify({ event_type: 'partner_joined', couple_id: result.coupleId }),
            }).catch(() => {});
          }
          router.replace({
            pathname: '/(auth)/paired-celebration',
            params: { partnerName: result.partnerName || '' },
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
              const { data: sessionData } = await supabase.auth.getSession();
              const token = sessionData?.session?.access_token;
              if (token) {
                fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/notify-partner`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                  body: JSON.stringify({ event_type: 'partner_joined', couple_id: result.coupleId }),
                }).catch(() => {});
              }
              router.replace({
                pathname: '/(auth)/paired-celebration',
                params: { partnerName: result.partnerName || '' },
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
          {/* Brand — tap 5 times to open debug screen */}
          <TouchableOpacity
            style={[styles.brandBlock, { marginBottom: V_MD }]}
            onPress={handleLogoTap}
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

          <TouchableOpacity
            style={styles.debugLink}
            onPress={() => router.push('/debug')}
            activeOpacity={0.7}
          >
            <AppText style={styles.debugLinkText}>Debug</AppText>
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
  debugLink: {
    paddingVertical: Spacing.sm,
    marginTop: Spacing.xs,
  },
  debugLinkText: {
    color: 'rgba(255,255,255,0.2)',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
  },
});
