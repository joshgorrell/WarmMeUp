import { useEffect } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { View, StyleSheet } from 'react-native';
import { useAuth } from '@/context/AuthContext';

/**
 * Deep link handler for warmup://invite/[CODE]
 * Redirects unauthenticated users to the pair screen pre-filled with the code.
 * Redirects authenticated users the same way — pair.tsx handles both cases.
 */
export default function InviteDeepLink() {
  const router = useRouter();
  const { code } = useLocalSearchParams<{ code: string }>();
  const { session, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    const upperCode = (code ?? '').toUpperCase().trim();
    if (!upperCode) {
      router.replace('/(auth)/welcome');
      return;
    }
    if (!session) {
      router.replace({ pathname: '/(auth)/pair', params: { prefilledCode: upperCode } });
    } else {
      router.replace({ pathname: '/(auth)/pair', params: { prefilledCode: upperCode } });
    }
  }, [loading, session, code]);

  return <View style={styles.bg} />;
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: '#07070A' },
});
