import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, AppStateStatus, StyleSheet, View } from 'react-native';
import { WifiOff } from 'lucide-react-native';
import AppText from '@/components/AppText';
import PillButton from '@/components/PillButton';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/context/ThemeContext';

const INITIAL_GRACE_MS = 8000;
const CHECK_TIMEOUT_MS = 3500;
const REQUIRED_FAILURES = 3;
const RETRY_INTERVAL_MS = 4000;

async function checkBackendReachable(): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) return true;

    const baseUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
    const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
    if (!baseUrl || !anonKey) return false;

    const response = await fetch(`${baseUrl}/rest/v1/`, {
      method: 'HEAD',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${sessionData.session.access_token}`,
      },
      signal: controller.signal,
    });

    return response.ok || response.status === 404 || response.status === 405;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

export default function OfflineGate({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  const [confirmedOffline, setConfirmedOffline] = useState(false);
  const [checking, setChecking] = useState(false);
  const failureCountRef = useRef(0);
  const mountedAtRef = useRef(Date.now());
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const inFlightRef = useRef(false);

  const runCheck = useCallback(async (manual = false) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    if (manual) setChecking(true);

    const reachable = await checkBackendReachable();

    if (reachable) {
      failureCountRef.current = 0;
      setConfirmedOffline(false);
    } else {
      failureCountRef.current += 1;
      const graceElapsed = Date.now() - mountedAtRef.current >= INITIAL_GRACE_MS;
      if (graceElapsed && failureCountRef.current >= REQUIRED_FAILURES) {
        setConfirmedOffline(true);
      }
    }

    if (manual) setChecking(false);
    inFlightRef.current = false;
  }, []);

  useEffect(() => {
    const kickoff = setTimeout(() => runCheck(false), 1200);
    const interval = setInterval(() => runCheck(false), RETRY_INTERVAL_MS);

    const sub = AppState.addEventListener('change', (next) => {
      const prev = appStateRef.current;
      appStateRef.current = next;
      if ((prev === 'background' || prev === 'inactive') && next === 'active') {
        runCheck(false);
      }
    });

    return () => {
      clearTimeout(kickoff);
      clearInterval(interval);
      sub.remove();
    };
  }, [runCheck]);

  if (!confirmedOffline) return <>{children}</>;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        <View style={[styles.iconWrap, { borderColor: colors.border }]}> 
          <WifiOff size={34} color={colors.text} strokeWidth={1.8} />
        </View>
        <AppText style={[styles.title, { color: colors.text }]}>You’re Offline</AppText>
        <AppText style={[styles.body, { color: colors.textSecondary ?? colors.text }]}> 
          Warm Me Up requires an internet connection to keep your private space in sync.
        </AppText>
        <AppText style={[styles.body, { color: colors.textSecondary ?? colors.text }]}> 
          That’s intentional. Both you and your partner can add or delete shared messages, photos, videos, Dares, and other content at any time. Staying connected helps make sure those changes take effect for both of you.
        </AppText>
        <AppText style={[styles.body, { color: colors.textSecondary ?? colors.text }]}> 
          We don’t keep an offline Vault that could let someone continue viewing a photo or video after their partner has deleted it.
        </AppText>
        <AppText style={[styles.emphasis, { color: colors.text }]}>Your shared space stays shared — including control over what’s in it.</AppText>
        <View style={styles.buttonWrap}>
          <PillButton
            label={checking ? 'Checking…' : 'Try Again'}
            onPress={() => runCheck(true)}
            disabled={checking}
          />
          {checking ? <ActivityIndicator style={styles.spinner} /> : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  content: {
    width: '100%',
    maxWidth: 520,
    alignItems: 'center',
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 16,
    textAlign: 'center',
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
    marginBottom: 14,
  },
  emphasis: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 2,
  },
  buttonWrap: {
    width: '100%',
    marginTop: 26,
    alignItems: 'center',
  },
  spinner: {
    marginTop: 12,
  },
});
