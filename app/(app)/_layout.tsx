import { useEffect, useRef, useState } from 'react';
import { Stack, useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import OfflineScreen from '@/components/OfflineScreen';
import { clearGalleryItems, evictAllCachedUrls } from '@/lib/mediaGalleryStore';

export default function AppLayout() {
  const { session, loading } = useAuth();
  const router = useRouter();
  const { isOffline, checking, checkConnection } = useOnlineStatus();
  // Key changes on each offline→online transition to force a full remount of
  // all child screens, preventing any stale in-memory state from surviving.
  const [stackKey, setStackKey] = useState(0);
  const wasOfflineRef = useRef(false);

  useEffect(() => {
    if (!loading && !session) {
      router.replace('/(auth)/welcome');
    }
  }, [session, loading]);

  // When entering the offline state, flush all in-memory gallery caches so
  // stale Vault items cannot repopulate after reconnect.
  useEffect(() => {
    if (isOffline) {
      wasOfflineRef.current = true;
      clearGalleryItems();
      evictAllCachedUrls();
    } else if (wasOfflineRef.current) {
      // Transitioning from offline → online: bump the key to remount all screens
      wasOfflineRef.current = false;
      setStackKey(k => k + 1);
    }
  }, [isOffline]);

  if (isOffline) {
    return <OfflineScreen checking={checking} onTryAgain={checkConnection} />;
  }

  return (
    <Stack key={stackKey} screenOptions={{ headerShown: false, animation: 'slide_from_right', contentStyle: { backgroundColor: '#05040A' } }}>
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
  );
}
