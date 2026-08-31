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
  const { session, loading, couple } = useAuth();

  useEffect(() => {
    if (loading) return;
    const upperCode = (code ?? '').toUpperCase().trim();
    if (!upperCode) {
      router.replace('/(auth)/welcome');
      return;
    }
    if (!session) {
      router.replace({ pathname: '/(auth)/pair', params: { prefilledCode: upperCode } });
      return;
    }
    // Authenticated user — check connection state
    if (couple?.user_b_id) {
      // Already paired; deep link has nothing to do here
      router.replace('/(app)/(tabs)');
      return;
    }
    // Authenticated but not yet paired — open pair screen with the code
    router.replace({ pathname: '/(auth)/pair', params: { prefilledCode: upperCode } });
  }, [loading, session, couple, code]);

  return <View style={styles.bg} />;
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: '#07070A' },
});
