import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { Session, User } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { supabase } from '@/lib/supabase';
import { Couple, Profile, UserSettings, SubscriptionInfo, DEFAULT_SUBSCRIPTION_INFO } from '@/lib/types';
import { maybeArchiveAndResetScores } from '@/lib/points';
import { registerForPushNotifications, savePushToken, clearPushToken } from '@/lib/notifications';
import { secureKey } from '@/lib/secureKey';
import { clearWeatherSessionCache } from '@/hooks/useWeather';

/**
 * Single source of truth for whether the unlock gate must be shown.
 * Returns true only when ALL of these hold:
 *   - login_method is not 'password'
 *   - lock_after_seconds is a non-negative number (not null, not -1)
 *   - elapsed time since last unlock >= lock_after_seconds
 *
 * If lock_after_seconds === -1 or null, ALWAYS returns false.
 */
export function computeIsUnlockRequired(
  settings: UserSettings | null,
  unlockedAtMs: number | null,
): boolean {
  const method = settings?.login_method ?? 'password';
  if (method === 'password') return false;
  const lockAfter = settings?.lock_after_seconds ?? null;
  if (lockAfter === null || lockAfter < 0) return false;
  // Never force a lock on first launch (no recorded unlock yet).
  if (unlockedAtMs === null) return false;
  return (Date.now() - unlockedAtMs) / 1000 >= lockAfter;
}

/**
 * True when a valid session exists AND stealth_mode_enabled is on.
 * Privacy mode is a cover screen, NOT authentication.
 * Never returns true for guests or when session state is unknown.
 */
export function computeShouldShowPrivacyCover(
  session: Session | null,
  settings: UserSettings | null,
): boolean {
  return !!session && settings?.stealth_mode_enabled === true;
}

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  couple: Couple | null;
  partnerProfile: Profile | null;
  settings: UserSettings | null;
  loading: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  subscriptionInfo: SubscriptionInfo;
  refreshSubscription: () => Promise<void>;
  /** True when the app requires the user to pass the unlock gate before continuing. */
  appLocked: boolean;
  /** Call after a successful PIN/biometric unlock to clear the lock flag. */
  unlockApp: () => void;
  /** Unconditionally lock the app (used by BackgroundLockManager after timer check). */
  lockApp: () => void;
  /**
   * Lock the app only if the lock timer says we should.
   * Use this from startup flows (index, weather) instead of lockApp()
   * so a short background trip doesn't force a re-lock within the grace period.
   */
  lockIfNeeded: () => boolean;
  /** The ms timestamp when the user last unlocked. Exposed for diagnostics. */
  unlockedAtMs: number | null;
  refreshCouple: () => Promise<void>;
  patchCouple: (patch: Partial<Couple>) => void;
  refreshSettings: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  signOut: () => void;
  /**
   * Shared ref that any biometric prompt must set to true while in-flight and
   * false when done. BackgroundLockManager checks this before navigating to /unlock
   * so it never interrupts an already-open Face ID / Touch ID prompt.
   */
  isAuthenticatingRef: React.MutableRefObject<boolean>;
  /**
   * Whether the vault biometric gate has been passed this session.
   * Stored here so it survives tab navigation without re-locking.
   */
  vaultUnlocked: boolean;
  setVaultUnlocked: (unlocked: boolean) => void;
  /** True when the admin has enabled the hidden 5-tap emergency debug entry points. */
  debugModeEnabled: boolean;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  profile: null,
  couple: null,
  partnerProfile: null,
  settings: null,
  loading: true,
  isAdmin: false,
  isSuperAdmin: false,
  subscriptionInfo: DEFAULT_SUBSCRIPTION_INFO,
  refreshSubscription: async () => {},
  appLocked: false,
  unlockApp: () => {},
  lockApp: () => {},
  lockIfNeeded: () => true,
  unlockedAtMs: null,
  refreshCouple: async () => {},
  patchCouple: () => {},
  refreshSettings: async () => {},
  refreshProfile: async () => {},
  signOut: async () => {},
  isAuthenticatingRef: { current: false },
  vaultUnlocked: false,
  setVaultUnlocked: () => {},
  debugModeEnabled: false,
});

function unlockedAtKey(userId: string) {
  return secureKey('warmup_unlocked_at', userId);
}

async function readUnlockedAt(userId: string): Promise<number | null> {
  try {
    let raw: string | null = null;
    if (Platform.OS !== 'web') {
      raw = await SecureStore.getItemAsync(unlockedAtKey(userId));
    } else if (typeof window !== 'undefined') {
      raw = window.sessionStorage.getItem(unlockedAtKey(userId));
    }
    if (!raw) return null;
    const ts = parseInt(raw, 10);
    return isNaN(ts) ? null : ts;
  } catch {
    return null;
  }
}

async function writeUnlockedAt(userId: string, ts: number): Promise<void> {
  try {
    if (Platform.OS !== 'web') {
      await SecureStore.setItemAsync(unlockedAtKey(userId), String(ts));
    } else if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(unlockedAtKey(userId), String(ts));
    }
  } catch {}
}

async function clearUnlockedAt(userId: string): Promise<void> {
  try {
    if (Platform.OS !== 'web') {
      await SecureStore.deleteItemAsync(unlockedAtKey(userId));
    } else if (typeof window !== 'undefined') {
      window.sessionStorage.removeItem(unlockedAtKey(userId));
    }
  } catch {}
}

async function fetchEffectiveSubscription(accessToken: string): Promise<SubscriptionInfo> {
  try {
    const baseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
    if (!baseUrl.startsWith('https://')) return { ...DEFAULT_SUBSCRIPTION_INFO, loading: false };
    const url = `${baseUrl}/functions/v1/get-effective-subscription`;
    console.log('[Subscription] fetching:', url);
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
        'Content-Type': 'application/json',
      },
    });
    console.log('[Subscription] response status:', res.status, res.statusText);
    const rawText = await res.text();
    console.log('[Subscription] response body:', rawText);
    if (!res.ok) {
      console.warn('[Subscription] non-OK response — returning default');
      return { ...DEFAULT_SUBSCRIPTION_INFO, loading: false };
    }
    let data: any;
    try { data = JSON.parse(rawText); } catch {
      console.warn('[Subscription] JSON parse failed');
      return { ...DEFAULT_SUBSCRIPTION_INFO, loading: false };
    }
    console.log('[Subscription] parsed — isPremium:', data.isPremium, 'source:', data.source, 'plan:', data.plan, 'canInvite:', data.canInvite);
    return {
      isPremium: data.isPremium ?? false,
      source: data.source ?? 'none',
      plan: data.plan ?? null,
      expiresAt: data.expiresAt ?? null,
      isOnTrial: data.isOnTrial ?? false,
      trialExpiresAt: data.trialExpiresAt ?? null,
      trialExpired: data.trialExpired ?? false,
      canInvite: data.canInvite ?? false,
      loading: false,
    };
  } catch (err: any) {
    console.error('[Subscription] fetch error:', err?.message);
    return { ...DEFAULT_SUBSCRIPTION_INFO, loading: false };
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [couple, setCouple] = useState<Couple | null>(null);
  const [partnerProfile, setPartnerProfile] = useState<Profile | null>(null);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [appLocked, setAppLocked] = useState(false);
  const [vaultUnlocked, setVaultUnlocked] = useState(false);
  const [debugModeEnabled, setDebugModeEnabled] = useState(false);
  const [subscriptionInfo, setSubscriptionInfo] = useState<SubscriptionInfo>(DEFAULT_SUBSCRIPTION_INFO);
  // Timestamp (ms) of the last successful unlock. Persisted across restarts.
  const unlockedAtRef = useRef<number | null>(null);
  // Prevents double-loading when getSession() and onAuthStateChange both fire on mount.
  const loadedUserIdRef = useRef<string | null>(null);
  // Global flag: true while any biometric prompt is open. Prevents BackgroundLockManager
  // from navigating to /unlock and interrupting an already-open Face ID prompt.
  const isAuthenticatingRef = useRef(false);

  useEffect(() => {
    // onAuthStateChange is the single source of truth for session state.
    // It fires immediately with INITIAL_SESSION on mount, so we don't need
    // a separate getSession() call, which was causing a double-load race.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        // On INITIAL_SESSION (cold start / restored keychain / iOS reinstall), validate
        // the token is still recognised by the backend before trusting it.
        // iOS Keychain survives app deletion, so a stale session may be restored even
        // after a fresh install. getUser() hits the network; an error means the token
        // is dead — clear all local state and treat as signed-out.
        if (event === 'INITIAL_SESSION') {
          (async () => {
            console.log('[AUTH INITIAL_SESSION]', { userId: session.user.id, validating: true });
            const { error } = await supabase.auth.getUser();
            if (error) {
              console.warn('[AUTH INITIAL_SESSION]', { valid: false, userId: session.user.id, error: error.message });
              await clearUnlockedAt(session.user.id);
              // signOut flushes the stale token from Keychain/SecureStore and fires
              // a SIGNED_OUT event which clears React state via the else branch below.
              await supabase.auth.signOut();
              return;
            }
            console.log('[AUTH INITIAL_SESSION]', { valid: true, userId: session.user.id });
            // Token is valid — proceed with normal startup load.
            setSession(session);
            setUser(session.user);
            if (loadedUserIdRef.current !== session.user.id) {
              loadedUserIdRef.current = session.user.id;
              await loadUserData(session.user.id);
            }
          })();
          return;
        }

        // For SIGNED_IN, TOKEN_REFRESHED, USER_UPDATED etc — trust the session directly.
        setSession(session);
        setUser(session.user);

        // Reload on SIGNED_IN or user switch. Skip TOKEN_REFRESHED / USER_UPDATED
        // to avoid thrashing the DB on routine token refreshes.
        const shouldLoad =
          event === 'SIGNED_IN' ||
          loadedUserIdRef.current !== session.user.id;
        if (shouldLoad) {
          loadedUserIdRef.current = session.user.id;
          (async () => {
            await loadUserData(session.user.id);
          })();
        }
      } else {
        setSession(null);
        setUser(null);
        loadedUserIdRef.current = null;
        setProfile(null);
        setCouple(null);
        setPartnerProfile(null);
        setSettings(null);
        setSubscriptionInfo({ ...DEFAULT_SUBSCRIPTION_INFO, loading: false });
        setLoading(false);
      }
    });

    // Safety net: if loading never resolves (e.g. network hang), unblock after 8s.
    const timeout = setTimeout(() => setLoading(false), 8000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  async function loadUserData(userId: string) {
    console.log('[Auth] loadUserData start uid:', userId);
    try {
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      const accessToken = currentSession?.access_token ?? '';

      const [, , fetchedSettings] = await Promise.all([
        fetchProfile(userId),
        fetchCouple(userId),
        fetchSettings(userId),
      ]);

      // Load global config flag — non-blocking, safe to fail
      (async () => {
        try {
          const { data } = await supabase
            .from('app_config')
            .select('value')
            .eq('key', 'debug_mode_enabled')
            .maybeSingle();
          setDebugModeEnabled(data?.value === true);
        } catch {}
      })();
      console.log('[Auth] loadUserData Promise.all done. login_method:', fetchedSettings?.login_method, 'lock_after_seconds:', fetchedSettings?.lock_after_seconds);

      // Restore persisted unlock timestamp so lockIfNeeded() respects the grace period
      // across full app restarts, not just background/foreground transitions.
      const persistedTs = await readUnlockedAt(userId);
      unlockedAtRef.current = persistedTs;
      setUnlockedAtMs(persistedTs);
      console.log('[Auth] unlockedAt restored:', persistedTs);

      // Register / refresh push token if the user has notifications enabled
      if (fetchedSettings?.push_notifications_enabled) {
        registerForPushNotifications().then(token => {
          if (token) savePushToken(userId, token);
        });
      }

      // Load subscription info — fire after other data so we don't block the UI gate
      if (accessToken) {
        fetchEffectiveSubscription(accessToken).then(info => {
          console.log('[Auth] subscriptionInfo resolved:', JSON.stringify(info));
          setSubscriptionInfo(info);
        });
      } else {
        console.log('[Auth] no accessToken — subscription set to default (not loading)');
        setSubscriptionInfo({ ...DEFAULT_SUBSCRIPTION_INFO, loading: false });
      }
    } catch (err) {
      console.warn('[Auth] loadUserData error:', err);
      // Network or unexpected error — don't wipe already-loaded state.
      setSubscriptionInfo({ ...DEFAULT_SUBSCRIPTION_INFO, loading: false });
    } finally {
      console.log('[Auth] loadUserData done — setLoading(false)');
      setLoading(false);
    }
  }

  async function fetchProfile(userId: string) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    if (!error) setProfile(data);
    return error ? null : data;
  }

  async function fetchCouple(userId: string) {
    // Primary fetch: active solo/invite-pending row owned by this user.
    let { data, error } = await supabase
      .from('couples')
      .select('*')
      .eq('user_a_id', userId)
      .is('user_b_id', null)
      .eq('active', true)
      .maybeSingle();

    // Fallback: active paired couple (user_b has joined).
    // Always require active=true so inactive/historical couple rows never become current state.
    if (!error && !data) {
      ({ data, error } = await supabase
        .from('couples')
        .select('*')
        .or(`user_a_id.eq.${userId},user_b_id.eq.${userId}`)
        .not('user_b_id', 'is', null)
        .eq('active', true)
        .maybeSingle());
    }

    // Final fallback: active couple in any configuration (catches edge cases).
    if (!error && !data) {
      ({ data, error } = await supabase
        .from('couples')
        .select('*')
        .or(`user_a_id.eq.${userId},user_b_id.eq.${userId}`)
        .eq('active', true)
        .maybeSingle());
    }

    console.log('[fetchCouple] uid:', userId, 'data:', JSON.stringify(data), 'error:', JSON.stringify(error));

    // Only update state if the query succeeded. A network error or unexpected
    // PostgREST error (e.g. multiple rows from a bad RLS policy) returns error!=null
    // and data=null — in that case keep whatever is already in state rather than
    // blanking the couple and sending the user to the /pair screen.
    if (!error) {
      setCouple(data);
    }

    if (error) return null;

    if (data) {
      const partnerId = data.user_a_id === userId ? data.user_b_id : data.user_a_id;
      if (partnerId) {
        const { data: partnerData, error: partnerError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', partnerId)
          .maybeSingle();
        if (!partnerError) setPartnerProfile(partnerData);
      } else {
        setPartnerProfile(null);
      }
      // Lazy monthly reset — archive prior month scores if needed
      maybeArchiveAndResetScores(data.id, userId).catch(() => {});
    } else {
      setPartnerProfile(null);
    }
    return data;
  }

  async function fetchSettings(userId: string): Promise<UserSettings | null> {
    const { data, error } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (!error) setSettings(data);
    return error ? null : data;
  }

  const refreshCouple = useCallback(async () => {
    if (user) await fetchCouple(user.id);
  }, [user]);

  // Live-sync: whenever the couple row changes in the DB (e.g. invite_code refreshed,
  // partner joined), re-fetch so the UI always reflects current data without needing
  // a manual pull-to-refresh or screen focus event.
  useEffect(() => {
    if (!couple?.id) return;
    const channel = supabase
      .channel(`couple:${couple.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'couples', filter: `id=eq.${couple.id}` },
        () => {
          if (user) fetchCouple(user.id);
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [couple?.id, user?.id]);

  const patchCouple = useCallback((patch: Partial<Couple>) => {
    setCouple(prev => prev ? { ...prev, ...patch } : prev);
  }, []);

  const refreshSettings = useCallback(async () => {
    if (user) await fetchSettings(user.id);
  }, [user]);

  const refreshProfile = useCallback(async () => {
    if (user) await fetchProfile(user.id);
  }, [user]);

  const signOut = useCallback(() => {
    // Clear all local state immediately so the UI responds without waiting on network.
    // onAuthStateChange will fire SIGNED_OUT and confirm once Supabase responds.
    const userId = user?.id ?? null;
    setSession(null);
    setUser(null);
    setProfile(null);
    setCouple(null);
    setPartnerProfile(null);
    setSettings(null);
    setAppLocked(false);
    setVaultUnlocked(false);
    setSubscriptionInfo({ ...DEFAULT_SUBSCRIPTION_INFO, loading: false });
    setDebugModeEnabled(false);
    unlockedAtRef.current = null;
    clearWeatherSessionCache();

    // Fire side-effects and the Supabase signOut without blocking the caller.
    if (userId) {
      clearPushToken(userId).catch(() => {});
      clearUnlockedAt(userId).catch(() => {});
    }
    supabase.auth.signOut().catch(() => {});
  }, [user]);

  const [unlockedAtMs, setUnlockedAtMs] = useState<number | null>(null);

  const unlockApp = useCallback(() => {
    const now = Date.now();
    unlockedAtRef.current = now;
    setUnlockedAtMs(now);
    setAppLocked(false);
    // Persist so the grace period survives a full app restart.
    if (user) {
      writeUnlockedAt(user.id, now);
    }
  }, [user]);

  const lockApp = useCallback(() => setAppLocked(true), []);

  const lockIfNeeded = useCallback((): boolean => {
    const shouldLock = computeIsUnlockRequired(settings, unlockedAtRef.current);
    if (shouldLock) setAppLocked(true);
    return shouldLock;
  }, [settings]);

  const refreshSubscription = useCallback(async () => {
    const { data: { session: currentSession } } = await supabase.auth.getSession();
    const accessToken = currentSession?.access_token ?? '';
    if (!accessToken) return;
    setSubscriptionInfo(prev => ({ ...prev, loading: true }));
    const info = await fetchEffectiveSubscription(accessToken);
    setSubscriptionInfo(info);
  }, []);

  const isAdmin = profile?.is_admin === true;
  const isSuperAdmin = profile?.is_super_admin === true;

  return (
    <AuthContext.Provider
      value={{ session, user, profile, couple, partnerProfile, settings, loading, isAdmin, isSuperAdmin, subscriptionInfo, refreshSubscription, appLocked, unlockApp, lockApp, lockIfNeeded, unlockedAtMs, refreshCouple, patchCouple, refreshSettings, refreshProfile, signOut, isAuthenticatingRef, vaultUnlocked, setVaultUnlocked, debugModeEnabled }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
