from pathlib import Path

# Registration: explicitly persist every field transition requires.
p = Path("app/(auth)/register.tsx")
s = p.read_text()
old = """          .update({
            first_name: fn,
            last_name: ln,
            display_name: fullName,
            ...(dob ? { date_of_birth: isoDate(dob), age_verified_at: nowIso } : {}),
          })"""
new = """          .update({
            first_name: fn,
            last_name: ln,
            display_name: fullName,
            ...(dob ? { date_of_birth: isoDate(dob), age_verified_at: nowIso } : {}),
            tos_accepted_at: nowIso,
          })"""
if old not in s:
    raise SystemExit("register profile fallback block not found")
p.write_text(s.replace(old, new, 1))

# Verification screen: refresh authoritative state and don't let User B bounce back to signup.
p = Path("app/(auth)/verify-email.tsx")
s = p.read_text()
s = s.replace(
    "const { refreshSubscription } = useAuth();",
    "const { refreshProfile, refreshCouple, refreshSubscription } = useAuth();"
)
marker = """      if (!user.email_confirmed_at) {
        setError('Email not verified yet. Please check your inbox and click the link, then try again.');
        return;
      }

      // Email is confirmed — handle pending invite code before routing
"""
replacement = """      if (!user.email_confirmed_at) {
        setError('Email not verified yet. Please check your inbox and click the link, then try again.');
        return;
      }

      // Verify registration from the database, not potentially stale AuthContext state.
      // A verified user should never bounce through transition and land back on signup.
      const { data: prof, error: profileError } = await supabase
        .from('profiles')
        .select('first_name, last_name, date_of_birth, age_verified_at, tos_accepted_at')
        .eq('id', user.id)
        .maybeSingle();
      if (profileError) {
        setError('Could not finish setting up your account. Please try again.');
        return;
      }
      const registrationComplete = !!(
        prof?.first_name && prof?.last_name && prof?.date_of_birth &&
        prof?.age_verified_at && prof?.tos_accepted_at
      );
      const code = pendingCode || (await loadPendingCode()) || '';
      if (!registrationComplete) {
        const params: Record<string, string> = { oauthComplete: '1' };
        if (code) params.pendingCode = code;
        router.replace({ pathname: '/(auth)/register', params });
        return;
      }

      await refreshProfile();

      // Email is confirmed — handle pending invite code before routing
"""
if marker not in s:
    raise SystemExit("verify-email confirmation marker not found")
s = s.replace(marker, replacement, 1)
s = s.replace(
    "      const code = pendingCode || (await loadPendingCode()) || '';\n      if (code) {",
    "      if (code) {",
    1,
)
old_success = """        if (result.ok) {
          await clearPendingCode();
          router.replace({
            pathname: '/(auth)/paired-celebration',
            params: { partnerName: result.inviterName || '', partnerAvatar: result.inviterAvatar || '' },
          });
          return;
        }"""
new_success = """        if (result.ok) {
          await clearPendingCode();
          await Promise.all([
            refreshProfile(),
            refreshCouple(),
            refreshSubscription(),
          ]);
          router.replace({
            pathname: '/(auth)/paired-celebration',
            params: { partnerName: result.inviterName || '', partnerAvatar: result.inviterAvatar || '' },
          });
          return;
        }"""
if old_success not in s:
    raise SystemExit("verify-email success block not found")
p.write_text(s.replace(old_success, new_success, 1))

# Auth callback: deterministic native email-verification + web OAuth routing.
Path("app/auth/callback.tsx").write_text("""import { useEffect, useRef } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { loadPendingCode, clearPendingCode } from '@/lib/inviteCode';
import { completePendingJoin, isDefinitiveJoinFailure } from '@/lib/coupleJoin';
import type { Session } from '@supabase/supabase-js';

/**
 * Handles both web OAuth callbacks and native email-verification deep links.
 * Routing is based on authoritative profile data so a freshly verified User B
 * cannot be bounced back to the signup screen by stale in-memory state.
 */
export default function AuthCallbackScreen() {
  const router = useRouter();
  const { refreshProfile, refreshCouple, refreshSubscription } = useAuth();
  const handledRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const finishSession = async (session: Session) => {
      if (handledRef.current || cancelled) return;
      handledRef.current = true;

      const user = session.user;
      const code = (await loadPendingCode()) || '';

      const { data: prof, error: profileError } = await supabase
        .from('profiles')
        .select('first_name, last_name, date_of_birth, age_verified_at, tos_accepted_at, onboarding_completed_at')
        .eq('id', user.id)
        .maybeSingle();

      if (cancelled) return;

      if (profileError) {
        handledRef.current = false;
        router.replace('/verify-retry');
        return;
      }

      const registrationComplete = !!(
        prof?.first_name &&
        prof?.last_name &&
        prof?.date_of_birth &&
        prof?.age_verified_at &&
        prof?.tos_accepted_at
      );

      if (!registrationComplete) {
        const params: Record<string, string> = { oauthComplete: '1' };
        if (code) params.pendingCode = code;
        router.replace({ pathname: '/(auth)/register', params });
        return;
      }

      await refreshProfile().catch(() => {});

      if (code) {
        const result = await completePendingJoin(code);
        if (cancelled) return;
        if (result.ok) {
          await clearPendingCode();
          await Promise.all([
            refreshProfile().catch(() => {}),
            refreshCouple().catch(() => {}),
            refreshSubscription().catch(() => {}),
          ]);
          router.replace({
            pathname: '/(auth)/paired-celebration',
            params: {
              partnerName: result.inviterName || '',
              partnerAvatar: result.inviterAvatar || '',
            },
          });
          return;
        }

        if (isDefinitiveJoinFailure(result.reason)) {
          await clearPendingCode();
        } else {
          router.replace({
            pathname: '/(auth)/verify-email',
            params: { email: user.email || '', pendingCode: code },
          });
          return;
        }
      }

      if (!prof?.onboarding_completed_at) {
        router.replace('/(auth)/onboarding');
        return;
      }

      await Promise.all([
        refreshCouple().catch(() => {}),
        refreshSubscription().catch(() => {}),
      ]);
      router.replace('/transition');
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) void finishSession(session);
    });

    // The auth event can fire before this screen mounts, especially after the mail app returns.
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) void finishSession(data.session);
    });

    timer = setTimeout(() => {
      if (!handledRef.current && !cancelled) router.replace('/(auth)/welcome');
    }, 8000);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      subscription.unsubscribe();
    };
  }, [router, refreshProfile, refreshCouple, refreshSubscription]);

  return (
    <View style={styles.root}>
      <ActivityIndicator color="#FF5A3D" size="large" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#07070A', alignItems: 'center', justifyContent: 'center' },
});
""")

# Apple auth: retain the secure native nonce flow, but map common provider/config failures.
p = Path("lib/oauth.ts")
s = p.read_text()
old = """  if (error) {
    logger.warn('[oauth/apple] signInWithIdToken error:', error.message);
    throw error;
  }"""
new = """  if (error) {
    logger.warn('[oauth/apple] signInWithIdToken error:', error.message);
    const message = error.message ?? '';
    if (/audience|client.?id|apple.*provider|provider.*apple|invalid.*token/i.test(message)) {
      throw new Error('Sign in with Apple could not verify this app. Please try again after updating Warm Me Up.');
    }
    throw error;
  }"""
if old not in s:
    raise SystemExit("Apple signInWithIdToken error block not found")
p.write_text(s.replace(old, new, 1))
