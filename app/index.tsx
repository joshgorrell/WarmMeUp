import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { View, StyleSheet } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { hasPinStored } from '@/lib/secureKey';

export default function IndexScreen() {
  const router = useRouter();
  const { session, loading, settings, lockIfNeeded, unlockApp } = useAuth();

  useEffect(() => {
    if (loading) return;

    if (!session) {
      router.replace('/(auth)/welcome');
      return;
    }

    // Wait for settings to be populated before routing.
    // AuthContext loads them in the same async batch as the session, so they
    // arrive within a render or two. Routing before they're ready causes
    // unlock.tsx to see null settings and default to PIN even when the user
    // has biometric configured.
    if (!settings) return;

    const goNext = async () => {
      const userId = session.user?.id;
      const loginMethod = settings.login_method ?? 'password';

      const needsGate = loginMethod !== 'password';

      if (needsGate) {
        const mustLock = lockIfNeeded();
        if (mustLock) {
          if (loginMethod === 'pin' || loginMethod === 'biometric') {
            // If there's no PIN stored on this device (e.g. Expo Go reload, new device),
            // send the user to setup-pin rather than showing a broken unlock screen.
            const pinExists = loginMethod === 'pin' ? await hasPinStored(userId!) : true;
            router.replace(pinExists ? '/unlock' : '/(auth)/setup-pin');
          } else {
            router.replace('/(auth)/setup-pin');
          }
        } else {
          // Still within grace period — refresh the unlock timestamp and go in.
          unlockApp();
          router.replace('/transition');
        }
      } else {
        // Password method — no gate, stamp unlock and go in.
        unlockApp();
        router.replace('/transition');
      }
    };

    // Check stealth bypass
    const bypass = settings?.stealth_bypass_until;
    const stealthEnabled = settings?.stealth_mode_enabled ?? true;

    if (!stealthEnabled) {
      goNext();
      return;
    }

    if (bypass && new Date(bypass) > new Date()) {
      goNext();
      return;
    }

    // Stealth mode — show weather screen; its button routes to /unlock or /transition
    router.replace('/weather');
  }, [loading, session, settings]);

  return <View style={styles.bg} />;
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: '#07070A' },
});
