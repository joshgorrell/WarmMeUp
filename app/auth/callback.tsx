import { useEffect, useRef, useState } from 'react';
import { View, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { parseAuthCallback } from '@/lib/authRedirect';
import { registrationComplete } from '@/lib/registration';
import { loadPendingCode, clearPendingCode } from '@/lib/inviteCode';
import { completePendingJoin, isDefinitiveJoinFailure } from '@/lib/coupleJoin';
import AppText from '@/components/AppText';
import PrimaryButton from '@/components/PrimaryButton';
import type { Session } from '@supabase/supabase-js';

export default function AuthCallbackScreen() {
  const router = useRouter();
  const auth = useAuth();
  const authRef = useRef(auth);
  authRef.current = auth;
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let handling = false;
    let initialized = false;
    let recovery = false;
    let processingLink = false;
    const fail = () => { if (!cancelled) { handling = false; setError(true); } };
    const finish = async (session: Session) => {
      if (cancelled || handling || !initialized || processingLink) return;
      handling = true;
      try {
        if (recovery) { router.replace('/(auth)/reset-password'); return; }
        const user = session.user;
        if (!user.email_confirmed_at) {
          router.replace({ pathname: '/(auth)/verify-email', params: { email: user.email || '' } });
          return;
        }
        const code = (await loadPendingCode()) || '';
        const { data: prof, error: profileError } = await supabase.from('profiles')
          .select('first_name,last_name,date_of_birth,age_verified_at,tos_accepted_at,onboarding_completed_at')
          .eq('id', user.id).single();
        if (profileError) throw profileError;
        if (cancelled) return;
        if (!registrationComplete(prof)) {
          router.replace({ pathname: '/(auth)/register', params: { oauthComplete: '1', ...(code ? { pendingCode: code } : {}) } });
          return;
        }
        await authRef.current.refreshProfile();
        if (code) {
          const result = await completePendingJoin(code);
          if (cancelled) return;
          if (result.ok) {
            await clearPendingCode();
            await Promise.all([authRef.current.refreshCouple(), authRef.current.refreshSubscription()]);
            if (cancelled) return;
            router.replace({ pathname: '/(auth)/paired-celebration', params: { partnerName: result.inviterName || '', partnerAvatar: result.inviterAvatar || '' } });
            return;
          }
          if (isDefinitiveJoinFailure(result.reason)) await clearPendingCode();
          router.replace({ pathname: prof.onboarding_completed_at ? '/(auth)/pair' : '/(auth)/onboarding', params: { pendingCode: code, prefilledCode: code } });
          return;
        }
        await Promise.all([authRef.current.refreshCouple(), authRef.current.refreshSubscription()]);
        if (!cancelled) router.replace('/transition');
      } catch { fail(); }
    };
    const handleUrl = async (url: string | null) => {
      if (processingLink || cancelled) return;
      processingLink = true;
      try {
        if (url) {
          const params = parseAuthCallback(url);
          recovery = recovery || params.recovery;
          if (params.error) throw new Error('Invalid or expired link');
          // Native auth clients do not inspect the URL automatically.
          if (Platform.OS !== 'web') {
            if (params.accessToken && params.refreshToken) {
              const { error } = await supabase.auth.setSession({ access_token: params.accessToken, refresh_token: params.refreshToken });
              if (error) throw error;
            } else if (params.code) {
              const { error } = await supabase.auth.exchangeCodeForSession(params.code);
              if (error) throw error;
            }
          }
        }
        initialized = true;
        processingLink = false;
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (data.session) await finish(data.session);
      } catch { processingLink = false; fail(); }
    };
    // Never call Auth APIs while onAuthStateChange holds its internal lock.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') recovery = true;
      if (session) setTimeout(() => { void finish(session); }, 0);
    });
    const linkSubscription = Linking.addEventListener('url', ({ url }) => { void handleUrl(url); });
    void (Platform.OS === 'web' ? Promise.resolve(window.location.href) : (Linking.getLinkingURL() ? Promise.resolve(Linking.getLinkingURL()) : Linking.getInitialURL()))
      .then(handleUrl).catch(fail);
    const timer = setTimeout(() => { if (!cancelled) fail(); }, 10000);
    return () => { cancelled = true; clearTimeout(timer); subscription.unsubscribe(); linkSubscription.remove(); };
  }, [router, attempt]);

  return <View style={styles.root}>{error ? <>
    <AppText style={styles.message}>We could not verify this link. Try again, or request a new email if it has expired.</AppText>
    <PrimaryButton label="Try Again" onPress={() => { setError(false); setAttempt(value => value + 1); }} />
    <PrimaryButton label="Sign In" onPress={() => router.replace('/(auth)/login')} />
  </> : <ActivityIndicator color="#FF5A3D" size="large" />}</View>;
}
const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: '#07070A', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 }, message: { color: '#fff', textAlign: 'center' } });
