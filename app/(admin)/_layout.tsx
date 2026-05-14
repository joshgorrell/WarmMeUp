import { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';

export default function AdminLayout() {
  const { profile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !profile?.is_admin) {
      router.replace('/(app)/(tabs)');
    }
  }, [loading, profile]);

  if (loading || !profile?.is_admin) return null;

  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }} />
  );
}
