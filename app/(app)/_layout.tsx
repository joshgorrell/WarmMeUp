import { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';

export default function AppLayout() {
  const { session, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !session) {
      router.replace('/(auth)/welcome');
    }
  }, [session, loading]);

  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="account" />
      <Stack.Screen name="activity" />
      <Stack.Screen name="settings" />
      <Stack.Screen name="dice" />
      <Stack.Screen name="dare" />
      <Stack.Screen name="tellme" />
      <Stack.Screen name="vault-viewer" />
      <Stack.Screen name="customize-prompts" />
    </Stack>
  );
}
