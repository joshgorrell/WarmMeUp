import { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';

export default function AdminLayout() {
  const { profile, isAdmin, isSuperAdmin, loading } = useAuth();
  const router = useRouter();

  const hasAdminAccess = isAdmin || isSuperAdmin;

  useEffect(() => {
    if (!loading && !hasAdminAccess) {
      router.replace('/(app)/(tabs)');
    }
  }, [loading, hasAdminAccess]);

  if (loading || !profile) return null;
  if (!hasAdminAccess) return null;

  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }} />
  );
}
