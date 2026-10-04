import { registrationComplete } from '@/lib/registration';
import { savePendingCode, sanitizeInviteCode, validateCodeFormat } from '@/lib/inviteCode';
import { useEffect } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { View, StyleSheet } from 'react-native';
import { useAuth } from '@/context/AuthContext';

/**
 * Deep link handler for warmup://invite/[CODE]
 *
 * - Unauthenticated: route to pair screen pre-filled with the code.
 * - Authenticated, already connected: route straight to the app (no need to pair).
 * - Authenticated, not connected: route to pair screen pre-filled with the code.
 */
export default function InviteDeepLink() {
  const router = useRouter();
  const { code } = useLocalSearchParams<{ code: string }>();
  const { session, loading, couple, coupleLoading, profile } = useAuth();

  useEffect(() => {
    if (loading || (session && coupleLoading)) return;
    const upperCode = sanitizeInviteCode(code ?? '');
    if (!validateCodeFormat(upperCode)) {
      router.replace('/(auth)/welcome');
      return;
    }
    if (!session) {
      router.replace({ pathname: '/(auth)/pair', params: { prefilledCode: upperCode } });
      return;
    }
    void savePendingCode(upperCode);
    if (!profile) { router.replace('/transition'); return; }
    if (!registrationComplete(profile)) {
      router.replace({ pathname: '/(auth)/register', params: { oauthComplete: '1', pendingCode: upperCode } });
      return;
    }
    if (!profile.onboarding_completed_at) {
      router.replace({ pathname: '/(auth)/onboarding', params: { pendingCode: upperCode } });
      return;
    }
    // Authenticated user — check connection state
    if (couple?.active && couple?.user_b_id) {
      // Already paired; deep link has nothing to do here
      router.replace('/(app)/(tabs)');
      return;
    }
    // Authenticated but not yet paired — open pair screen with the code
    router.replace({ pathname: '/(auth)/pair', params: { prefilledCode: upperCode } });
  }, [loading, session, couple, coupleLoading, profile, code, router]);

  return <View style={styles.bg} />;
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: '#07070A' },
});
