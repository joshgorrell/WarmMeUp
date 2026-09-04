import { useEffect, useRef, useState, useCallback } from 'react';
import { Platform } from 'react-native';
import * as Network from 'expo-network';
import { logger } from '@/lib/logger';

const HARD_OFFLINE_DEBOUNCE_MS = 700;
const REACHABILITY_GRACE_MS = 8000;
const REACHABILITY_RETRIES = 3;
const REACHABILITY_RETRY_INTERVAL_MS = 4000;
const REACHABILITY_TIMEOUT_MS = 6000;

type Status = 'online' | 'offline';

interface OnlineStatus {
  isOffline: boolean;
  checking: boolean;
  checkConnection: () => Promise<boolean>;
}

// Lightweight fetch to the Supabase REST root. Any HTTP response — even 401/403/404/5xx —
// means the server was reached. Only network-level failures (timeout, DNS, connection
// refused) count as a reachability failure.
async function checkReachability(): Promise<boolean> {
  const url = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
  if (!url) return true; // Can't check without a URL — assume online to avoid false offline
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REACHABILITY_TIMEOUT_MS);
  try {
    const res = await fetch(`${url}/rest/v1/`, {
      method: 'HEAD',
      signal: controller.signal,
      headers: { apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '' },
    });
    // Any HTTP status means the server responded
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function getNetworkState(): Promise<{ isConnected: boolean | null }> {
  if (Platform.OS === 'web') {
    return { isConnected: navigator.onLine };
  }
  try {
    const state = await Network.getNetworkStateAsync();
    return { isConnected: state.isConnected ?? state.isInternetReachable ?? false };
  } catch {
    return { isConnected: null };
  }
}

export function useOnlineStatus(): OnlineStatus {
  const [isOffline, setIsOffline] = useState(false);
  const [checking, setChecking] = useState(false);

  const isOfflineRef = useRef(false);
  const hardDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reachabilityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reachabilityFailuresRef = useRef(0);
  const reachabilityGraceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const checkingRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (hardDebounceRef.current) clearTimeout(hardDebounceRef.current);
      if (reachabilityTimerRef.current) clearTimeout(reachabilityTimerRef.current);
      if (reachabilityGraceRef.current) clearTimeout(reachabilityGraceRef.current);
    };
  }, []);

  const setOfflineState = useCallback((offline: boolean) => {
    if (isOfflineRef.current === offline) return;
    isOfflineRef.current = offline;
    if (mountedRef.current) setIsOffline(offline);
  }, []);

  const stopReachabilityChecks = useCallback(() => {
    if (reachabilityTimerRef.current) {
      clearTimeout(reachabilityTimerRef.current);
      reachabilityTimerRef.current = null;
    }
    if (reachabilityGraceRef.current) {
      clearTimeout(reachabilityGraceRef.current);
      reachabilityGraceRef.current = null;
    }
    reachabilityFailuresRef.current = 0;
  }, []);

  const runReachabilityCheck = useCallback(async (): Promise<boolean> => {
    const reached = await checkReachability();
    if (!mountedRef.current) return reached;
    if (reached) {
      reachabilityFailuresRef.current = 0;
      stopReachabilityChecks();
      setOfflineState(false);
      return true;
    }
    reachabilityFailuresRef.current += 1;
    logger.log(`[OnlineStatus] reachability check failed (${reachabilityFailuresRef.current}/${REACHABILITY_RETRIES})`);
    if (reachabilityFailuresRef.current >= REACHABILITY_RETRIES) {
      stopReachabilityChecks();
      setOfflineState(true);
      return false;
    }
    // Schedule next retry
    reachabilityTimerRef.current = setTimeout(async () => {
      if (mountedRef.current) await runReachabilityCheck();
    }, REACHABILITY_RETRY_INTERVAL_MS);
    return false;
  }, [setOfflineState, stopReachabilityChecks]);

  const handleNetworkChange = useCallback(async () => {
    const { isConnected } = await getNetworkState();

    if (isConnected === false) {
      // Hard offline — debounce briefly to avoid flicker during transitions
      stopReachabilityChecks();
      if (hardDebounceRef.current) clearTimeout(hardDebounceRef.current);
      hardDebounceRef.current = setTimeout(() => {
        if (mountedRef.current) {
          setOfflineState(true);
        }
      }, HARD_OFFLINE_DEBOUNCE_MS);
      return;
    }

    // isConnected is true or null (unknown) — cancel any pending hard-offline debounce
    if (hardDebounceRef.current) {
      clearTimeout(hardDebounceRef.current);
      hardDebounceRef.current = null;
    }

    if (isConnected === true) {
      // Device says connected — verify reachability with grace period
      // If already offline, start checking immediately (recovery path)
      if (isOfflineRef.current) {
        // Recovery: check immediately
        reachabilityFailuresRef.current = 0;
        await runReachabilityCheck();
      } else {
        // Not yet offline — start grace-period-based monitoring
        if (!reachabilityGraceRef.current && !reachabilityTimerRef.current) {
          reachabilityGraceRef.current = setTimeout(async () => {
            if (!mountedRef.current) return;
            reachabilityGraceRef.current = null;
            await runReachabilityCheck();
          }, REACHABILITY_GRACE_MS);
        }
      }
    }
  }, [runReachabilityCheck, setOfflineState, stopReachabilityChecks]);

  // Initial check + network event subscription
  useEffect(() => {
    handleNetworkChange();

    let subscription: { remove: () => void } | null = null;
    if (Platform.OS !== 'web') {
      subscription = Network.addNetworkStateListener(async () => {
        handleNetworkChange();
      });
    } else {
      const handler = () => handleNetworkChange();
      window.addEventListener('online', handler);
      window.addEventListener('offline', handler);
      subscription = {
        remove: () => {
          window.removeEventListener('online', handler);
          window.removeEventListener('offline', handler);
        },
      };
    }

    return () => {
      subscription?.remove();
    };
  }, [handleNetworkChange]);

  // Manual check (Try Again button)
  const checkConnection = useCallback(async (): Promise<boolean> => {
    if (checkingRef.current) return !isOfflineRef.current;
    checkingRef.current = true;
    if (mountedRef.current) setChecking(true);

    const { isConnected } = await getNetworkState();

    if (isConnected === false) {
      stopReachabilityChecks();
      setOfflineState(true);
      checkingRef.current = false;
      if (mountedRef.current) setChecking(false);
      return false;
    }

    // Device says connected — verify reachability
    reachabilityFailuresRef.current = 0;
    stopReachabilityChecks();
    const reached = await checkReachability();

    if (reached) {
      setOfflineState(false);
    } else {
      // On manual check, do a quick second attempt before declaring offline
      const secondAttempt = await checkReachability();
      if (secondAttempt) {
        setOfflineState(false);
      } else {
        setOfflineState(true);
      }
    }

    checkingRef.current = false;
    if (mountedRef.current) setChecking(false);
    return !isOfflineRef.current;
  }, [setOfflineState, stopReachabilityChecks]);

  return { isOffline, checking, checkConnection };
}
