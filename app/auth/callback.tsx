import { useEffect, useRef } from 'react';
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
