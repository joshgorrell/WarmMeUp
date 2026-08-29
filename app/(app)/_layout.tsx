import { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import OfflineGate from '@/components/OfflineGate';

export default function AppLayout() {
  const { session, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !session) {
      router.replace('/(auth)/welcome');
    }
  }, [session, loading]);

  return (
    <OfflineGate>
      <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right', contentStyle: { backgroundColor: '#05040A' } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="account" />
        <Stack.Screen name="activity" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="dice" />
        <Stack.Screen name="dare" />
        <Stack.Screen
          name="vault-viewer"
          options={{
            animation: 'slide_from_bottom',
            gestureEnabled: true,
            gestureDirection: 'vertical',
            fullScreenGestureEnabled: true,
          }}
        />
        <Stack.Screen name="customize-prompts" />
        <Stack.Screen name="my-stats" />
        <Stack.Screen name="delete-content" />
      </Stack>
    </OfflineGate>
  );
}
