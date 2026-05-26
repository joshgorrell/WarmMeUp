import { useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import { View, StyleSheet } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { hasPinStored } from '@/lib/secureKey';

// If settings haven't arrived this many ms after loading=false, fall through to
// /transition rather than hanging on the black index screen indefinitely.
const SETTINGS_WAIT_MS = 4000;

export default function IndexScreen() {
  const router = useRouter();
  const { session, loading, settings, lockIfNeeded, unlockApp } = useAuth();
  const settingsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const routedRef = useRef(false);

  useEffect(() => {
    if (loading) return;

    console.log('[LAUNCH DEBUG]', {
      hasSession: !!session,
      userId: session?.user?.id,
      settingsLoaded: !!settings,
      loginMethod: settings?.login_method,
      stealthMode: settings?.stealth_mode_enabled,
      lockAfter: settings?.lock_after_seconds,
    });

    if (!session) {
      router.replace('/(auth)/welcome');
      return;
    }

    // Wait for settings to be populated before routing.
    // AuthContext loads them in the same async batch as the session, so they
    // arrive within a render or two. Routing before they're ready causes
    // unlock.tsx to see null settings and default to PIN even when the user
    // has biometric configured.
    if (!settings) {
      // Start a fallback timer the first time we land here without settings.
      if (!settingsTimeoutRef.current) {
        settingsTimeoutRef.current = setTimeout(() => {
          settingsTimeoutRef.current = null;
          if (!routedRef.current) {
            console.warn('[index] settings timeout — falling through to /transition');
            routedRef.current = true;
            unlockApp();
            router.replace('/transition');
          }
        }, SETTINGS_WAIT_MS);
      }
      return;
    }

    // Settings arrived — cancel any pending timeout.
    if (settingsTimeoutRef.current) {
      clearTimeout(settingsTimeoutRef.current);
      settingsTimeoutRef.current = null;
    }

    if (routedRef.current) return;

    const bypass = settings.stealth_bypass_until;
    const stealthEnabled = settings.stealth_mode_enabled ?? false;

    console.log('[INDEX ROUTE DECISION]', {
      stealthEnabled,
      bypass,
      bypassActive: bypass ? new Date(bypass) > new Date() : false,
      loginMethod: settings.login_method ?? 'password',
    });

    const goNext = async () => {
      if (routedRef.current) return;
      routedRef.current = true;
      const userId = session.user?.id;
      const loginMethod = settings.login_method ?? 'password';
      const needsGate = loginMethod !== 'password';

      if (needsGate) {
        const mustLock = lockIfNeeded();
        const pinExists = loginMethod === 'pin' ? await hasPinStored(userId!) : true;
        console.log('[INDEX ROUTE DECISION] gate', {
          loginMethod,
          mustLock,
          pinExists,
          destination: mustLock ? (pinExists ? '/unlock' : '/(auth)/setup-pin') : '/transition',
        });
        if (mustLock) {
          router.replace(pinExists ? '/unlock' : '/(auth)/setup-pin');
        } else {
          unlockApp();
          router.replace('/transition');
        }
      } else {
        console.log('[INDEX ROUTE DECISION] no gate → /transition');
        unlockApp();
        router.replace('/transition');
      }
    };

    if (!stealthEnabled) {
      goNext();
      return;
    }

    if (bypass && new Date(bypass) > new Date()) {
      goNext();
      return;
    }

    // Stealth mode active — show weather cover screen.
    // weather.tsx handles the lock/PIN gate when the user taps "Coast is Clear".
    console.log('[INDEX ROUTE DECISION] → /weather (stealth active, no bypass)');
    routedRef.current = true;
    router.replace('/weather');
  }, [loading, session, settings]);

  useEffect(() => {
    return () => {
      if (settingsTimeoutRef.current) clearTimeout(settingsTimeoutRef.current);
    };
  }, []);

  return <View style={styles.bg} />;
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: '#07070A' },
});
