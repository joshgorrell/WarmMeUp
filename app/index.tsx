import { useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import { View, StyleSheet } from 'react-native';
import { useAuth, computeIsUnlockRequired, computeShouldShowPrivacyCover } from '@/context/AuthContext';
import { logDebugEvent } from '@/lib/debugLog';
import { logger } from '@/lib/logger';

// If settings haven't arrived this many ms after loading=false, fall through to
// /transition rather than hanging on the black index screen indefinitely.
const SETTINGS_WAIT_MS = 300;

export default function IndexScreen() {
  const router = useRouter();
  const { session, loading, settings, unlockedAtMs, unlockApp } = useAuth();
  const settingsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const routedRef = useRef(false);
  const mountMs = useRef(Date.now());

  useEffect(() => {
    if (loading) return;

    const bootElapsedMs = Date.now() - mountMs.current;

    // Rule 1: No valid session → Welcome/Login. Never show Fake Weather for guests.
    if (!session) {
      logDebugEvent('LAUNCH BOOT', { hasSession: false, settingsLoaded: false, bootElapsedMs });
      logDebugEvent('LAUNCH ROUTE DECISION', {
        sessionHydrated: true,
        sessionValidAtLaunch: false,
        privacyModeEnabled: null,
        requireUnlockAfterSeconds: null,
        lastUnlockedAt: null,
        unlockRequiredReason: 'no_session',
        initialRouteDecision: '/(auth)/welcome',
        routeDecisionReason: 'No valid session',
        fakeWeatherShownReason: 'not_shown',
        bootElapsedMs,
      });
      logger.log('[LAUNCH DEBUG] no session → welcome');
      router.replace('/(auth)/welcome');
      return;
    }

    logDebugEvent('LAUNCH BOOT', {
      hasSession: true,
      userId: session?.user?.id,
      settingsLoaded: !!settings,
      bootElapsedMs,
    });
    logger.log('[LAUNCH DEBUG]', {
      hasSession: true,
      userId: session?.user?.id,
      settingsLoaded: !!settings,
      loginMethod: settings?.login_method,
      stealthMode: settings?.stealth_mode_enabled,
      lockAfter: settings?.lock_after_seconds,
      unlockedAtMs,
      transitionElapsedMs: bootElapsedMs,
    });

    // Wait for settings before routing — they arrive in the same async batch as
    // the session. Routing early means unlock.tsx sees null settings and can't
    // determine the correct method.
    if (!settings) {
      if (!settingsTimeoutRef.current) {
        settingsTimeoutRef.current = setTimeout(() => {
          settingsTimeoutRef.current = null;
          if (!routedRef.current) {
            console.warn('[index] settings timeout — falling through to /transition', { transitionElapsedMs: Date.now() - mountMs.current });
            routedRef.current = true;
            // Do NOT call unlockApp() here — we don't know if unlock is required.
            // Skipping the stamp means a subsequent foreground lock check will
            // correctly apply the user's configured lock_after_seconds.
            logDebugEvent('LAUNCH ROUTE DECISION', {
              sessionHydrated: true,
              sessionValidAtLaunch: true,
              privacyModeEnabled: null,
              requireUnlockAfterSeconds: null,
              lastUnlockedAt: unlockedAtMs,
              unlockRequiredReason: 'settings_timeout_unknown',
              initialRouteDecision: '/transition',
              routeDecisionReason: 'Settings did not load within timeout — falling through safely',
              fakeWeatherShownReason: 'not_shown',
              bootElapsedMs: Date.now() - mountMs.current,
            });
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
    const bypassActive = bypass ? new Date(bypass) > new Date() : false;
    const shouldShowPrivacyCover = computeShouldShowPrivacyCover(session, settings);
    const mustLock = computeIsUnlockRequired(settings, unlockedAtMs);

    logger.log('[INDEX ROUTE DECISION]', {
      shouldShowPrivacyCover,
      bypassActive,
      loginMethod: settings.login_method ?? 'password',
      mustLock,
    });

    // Privacy Mode OFF (or bypass active) → check unlock requirement, then app
    const goNext = async () => {
      if (routedRef.current) return;
      routedRef.current = true;
      const userId = session.user?.id;
      const loginMethod = settings.login_method ?? 'none';

      logger.log('[INDEX ROUTE DECISION] gate', {
        loginMethod,
        mustLock,
        destination: mustLock ? '/unlock' : '/transition',
      });

      if (mustLock) {
        const dest = '/unlock';
        logDebugEvent('LAUNCH ROUTE DECISION', {
          sessionHydrated: true,
          sessionValidAtLaunch: true,
          privacyModeEnabled: settings.stealth_mode_enabled ?? false,
          requireUnlockAfterSeconds: settings.lock_after_seconds ?? null,
          lastUnlockedAt: unlockedAtMs,
          unlockRequiredReason: `lock_after_seconds=${settings.lock_after_seconds}, method=${loginMethod}`,
          initialRouteDecision: dest,
          routeDecisionReason: 'Unlock required — Privacy Mode off or bypass active',
          fakeWeatherShownReason: bypassActive ? 'bypass_active' : 'not_shown',
          bootElapsedMs,
        });
        router.replace(dest);
      } else {
        unlockApp();
        logDebugEvent('LAUNCH ROUTE DECISION', {
          sessionHydrated: true,
          sessionValidAtLaunch: true,
          privacyModeEnabled: settings.stealth_mode_enabled ?? false,
          requireUnlockAfterSeconds: settings.lock_after_seconds ?? null,
          lastUnlockedAt: unlockedAtMs,
          unlockRequiredReason: 'none',
          initialRouteDecision: '/transition',
          routeDecisionReason: 'No unlock required — entering app',
          fakeWeatherShownReason: bypassActive ? 'bypass_active' : 'not_shown',
          bootElapsedMs,
        });
        router.replace('/transition');
      }
    };

    // Privacy Mode OFF or bypass active → skip weather, check unlock
    if (!shouldShowPrivacyCover || bypassActive) {
      goNext();
      return;
    }

    // Privacy Mode ON and no active bypass → show fake weather.
    // weather.tsx evaluates the unlock requirement after "Coast is Clear" tap.
    routedRef.current = true;
    logDebugEvent('LAUNCH ROUTE DECISION', {
      sessionHydrated: true,
      sessionValidAtLaunch: true,
      privacyModeEnabled: true,
      requireUnlockAfterSeconds: settings.lock_after_seconds ?? null,
      lastUnlockedAt: unlockedAtMs,
      unlockRequiredReason: mustLock ? `lock_after_seconds=${settings.lock_after_seconds}, method=${settings.login_method}` : 'none',
      initialRouteDecision: '/weather',
      routeDecisionReason: 'Privacy Mode is ON — show fake weather cover first',
      fakeWeatherShownReason: 'stealth_mode_enabled=true, no_bypass',
      bootElapsedMs,
    });
    logger.log('[INDEX ROUTE DECISION] → /weather (stealth active, no bypass)');
    router.replace('/weather');
  }, [loading, session, settings, unlockedAtMs]);

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
