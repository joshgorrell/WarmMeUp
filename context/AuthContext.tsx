import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Platform, AppState } from 'react-native';
import { Session, User } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { supabase } from '@/lib/supabase';
import { Couple, Profile, UserSettings, SubscriptionInfo, DEFAULT_SUBSCRIPTION_INFO } from '@/lib/types';
import { maybeArchiveAndResetScores } from '@/lib/points';
import { registerForPushNotifications, savePushToken, clearPushToken } from '@/lib/notifications';
import { clearAppBadge } from '@/lib/appBadge';
import { secureKey } from '@/lib/secureKey';
import { clearWeatherSessionCache } from '@/hooks/useWeather';
import { logInRevenueCat, logOutRevenueCat } from '@/lib/purchases';
import { saveDiagnosticsSnapshot } from '@/lib/diagnosticsSnapshot';
import { emitIncoming } from '@/lib/incomingEvents';
import { logger } from '../lib/logger';

/**
 * Single source of truth for whether the unlock gate must be shown.
 *
 * Returns true only when ALL of these hold:
 *   - login_method is not 'none' (or the legacy 'password' alias)
 *   - lock_after_seconds is not null and not -1 (those mean "no re-lock timer")
 *   - elapsed time since last unlock >= lock_after_seconds
 *
 * Special values:
 *   lock_after_seconds = null / -1  ("Never re-lock")
 *     → still requires unlock on first open (unlockedAtMs === null),
 *       but never re-locks after that.
 *   lock_after_seconds = 0  ("Immediately")
 *     → always requires unlock, even after a one-second background trip.
 *   lock_after_seconds > 0  (timer)
 *     → requires unlock once the timer has elapsed since last unlock.
 *
 * When lock_after_seconds is null with a non-'none' method, the behaviour is
 * "require on first open, never re-lock" — the same as -1.
 */
export function computeIsUnlockRequired(
  settings: UserSettings | null,
  unlockedAtMs: number | null,
): boolean {
  const method = settings?.login_method ?? 'none';
  // 'none' and legacy 'password' both mean no app unlock
  if (method === 'none' || method === 'password') return false;

  const lockAfter = settings?.lock_after_seconds ?? null;

  // null / -1 = "Never re-lock": require only if never unlocked this session
  if (lockAfter === null || lockAfter < 0) return unlockedAtMs === null;

  // 0 = "Immediately": always require
  if (lockAfter === 0) return true;

  // Timer-based: first install/cleared state → give a grace period (don't lock)
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
  /** Set to the partner's display_name when User A's partner just joined via realtime. Clear after navigating to the celebration screen. */
  justPairedPartnerName: string | null;
  clearJustPaired: () => void;
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
  /** True when Global Debug Access is enabled (all users, pre-login). */
  globalDebugAccessEnabled: boolean;
  /**
   * Increments every time Reset Points completes. Screens subscribe via useEffect
   * to this value and re-fetch scores when it changes.
   */
  scoreResetAt: number;
  notifyScoreReset: () => void;
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
  globalDebugAccessEnabled: false,
  scoreResetAt: 0,
  notifyScoreReset: () => {},
  justPairedPartnerName: null,
  clearJustPaired: () => {},
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
  } catch (err: any) {
    console.warn('[Auth] writeUnlockedAt failed — lock timer will reset on next restart:', err?.message);
  }
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

/**
 * If the edge function returns canInvite=false for a known admin/super-admin,
 * override the result client-side. This guards against stale Deno containers
 * that haven't picked up the latest deployment.
 * userId is checked against the profiles table separately — here we just
 * re-read the profile from the Supabase client (uses the authenticated session).
 */
async function applyAdminOverrideAsync(info: SubscriptionInfo, userId: string): Promise<SubscriptionInfo> {
  if (info.canInvite && info.isPremium) return info; // already correct, skip
  try {
    const { data } = await supabase
      .from('profiles')
      .select('is_admin, is_super_admin')
      .eq('id', userId)
      .maybeSingle();
    if (data?.is_admin === true || data?.is_super_admin === true) {
      return {
        ...info,
        isPremium: true,
        canInvite: true,
        source: data.is_super_admin ? 'super_admin' : 'admin',
        plan: 'admin',
        loading: false,
      };
    }
  } catch {}
  return info;
}

/**
 * Separate from admin override — this checks the admin_grants table for an
 * active entitlement grant (free_access, etc.) with can_invite=true.
 * RLS allows users to read their own grants, so the authenticated client works.
 * This is the client-side fallback for when the edge function is unavailable
 * or returns stale data. It must NEVER be confused with the admin override above:
 * admin override is for is_admin/is_super_admin profile flags; this is for
 * regular users who received a premium entitlement grant.
 */
async function applyEntitlementGrantFallbackAsync(info: SubscriptionInfo, userId: string): Promise<SubscriptionInfo> {
  if (info.canInvite && info.isPremium) return info; // already correct, skip
  try {
    const { data: grant, error } = await supabase
      .from('admin_grants')
      .select('active, can_invite, expires_at, entitlement_type')
      .eq('user_id', userId)
      .eq('active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      logger.log('[Subscription] entitlement grant fallback query error:', error.message);
      return info;
    }
    if (grant && grant.active === true && grant.can_invite === true) {
      const expired = grant.expires_at && new Date(grant.expires_at) < new Date();
      if (!expired) {
        logger.log('[Subscription] entitlement grant fallback applied — canInvite forced true');
        return {
          ...info,
          isPremium: true,
          canInvite: true,
          source: 'admin_grant',
          plan: null,
          expiresAt: grant.expires_at,
          loading: false,
        };
      }
    }
  } catch (err: any) {
    logger.log('[Subscription] entitlement grant fallback error:', err?.message);
  }
  return info;
}

async function fetchEffectiveSubscription(accessToken: string): Promise<SubscriptionInfo> {
  try {
    const baseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
    if (!baseUrl.startsWith('https://')) return { ...DEFAULT_SUBSCRIPTION_INFO, loading: false };
    const url = `${baseUrl}/functions/v1/get-effective-subscription`;
    logger.log('[Subscription] fetching:', url);
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
        'Content-Type': 'application/json',
      },
    });
    logger.log('[Subscription] response status:', res.status, res.statusText);
    const rawText = await res.text();
    if (!res.ok) {
      logger.log('[Subscription] non-OK response body:', rawText.slice(0, 500));
      return { ...DEFAULT_SUBSCRIPTION_INFO, loading: false };
    }
    let data: any;
    try { data = JSON.parse(rawText); } catch {
      logger.log('[Subscription] JSON parse failed. Raw:', rawText.slice(0, 500));
      return { ...DEFAULT_SUBSCRIPTION_INFO, loading: false };
    }
    logger.log('[Subscription] parsed:', JSON.stringify({ isPremium: data.isPremium, source: data.source, canInvite: data.canInvite, trialExpired: data.trialExpired, grantExpired: data.grantExpired }));
    return {
      isPremium: data.isPremium ?? false,
      source: data.source ?? 'none',
      plan: data.plan ?? null,
      expiresAt: data.expiresAt ?? null,
      isOnTrial: data.isOnTrial ?? false,
      trialExpiresAt: data.trialExpiresAt ?? null,
      trialExpired: data.trialExpired ?? false,
      grantExpired: data.grantExpired ?? false,
      grantExpiresAt: data.grantExpiresAt ?? null,
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
  const [globalDebugAccessEnabled, setGlobalDebugAccessEnabled] = useState(false);
  const [subscriptionInfo, setSubscriptionInfo] = useState<SubscriptionInfo>(DEFAULT_SUBSCRIPTION_INFO);
  const [justPairedPartnerName, setJustPairedPartnerName] = useState<string | null>(null);
  const [scoreResetAt, setScoreResetAt] = useState(0);
  // Tracks the previous user_b_id so we can detect the null→populated transition.
  // Timestamp (ms) of the last successful unlock. Persisted across restarts.
  const unlockedAtRef = useRef<number | null>(null);
  // Prevents double-loading when getSession() and onAuthStateChange both fire on mount.
  const loadedUserIdRef = useRef<string | null>(null);
  // Set to true after the very first fetchCouple() completes. Only after this point
  // should realtime couple updates trigger the "partner just joined" celebration path.
  // Without this guard, every app open causes a false-positive: couple starts as null,
  // fetchCouple sets user_b_id to a real value, and the realtime effect sees null→value.
  const coupleInitialLoadDoneRef = useRef(false);
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
            const { error } = await supabase.auth.getUser();
            if (error) {
              // Persist the cleared-session diagnostics BEFORE signOut wipes SecureStore,
              // so the debug screen can tell us exactly why and when the session was cleared.
              if (Platform.OS !== 'web') {
                const clearedAt = new Date().toISOString();
                const reason = `INITIAL_SESSION getUser failed: ${error.message} (status=${(error as any).status ?? 'n/a'})`;
                await Promise.all([
                  SecureStore.setItemAsync('debug_session_cleared_at', clearedAt).catch(() => {}),
                  SecureStore.setItemAsync('debug_session_cleared_reason', reason).catch(() => {}),
                ]);
              }
              await clearUnlockedAt(session.user.id);
              // signOut flushes the stale token from Keychain/SecureStore and fires
              // a SIGNED_OUT event which clears React state via the else branch below.
              await supabase.auth.signOut();
              return;
            }
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

    // Safety net: if loading never resolves (e.g. network hang), unblock after 1.5s.
    const timeout = setTimeout(() => setLoading(false), 1500);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  async function loadUserData(userId: string) {
    try {
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      const accessToken = currentSession?.access_token ?? '';

      const [, , fetchedSettings] = await Promise.all([
        fetchProfile(userId),
        fetchCouple(userId),
        fetchSettings(userId),
      ]);

      // Load global config flags — non-blocking, safe to fail
      (async () => {
        try {
          const { data } = await supabase
            .from('app_config')
            .select('key, value')
            .in('key', ['debug_mode_enabled', 'global_debug_access']);
          if (Array.isArray(data)) {
            for (const row of data) {
              if (row.key === 'debug_mode_enabled') {
                setDebugModeEnabled(row.value === true);
              } else if (row.key === 'global_debug_access') {
                const val = row.value;
                const enabled = val?.enabled === true;
                const expiresAt: string | null = val?.expires_at ?? null;
                const expired = expiresAt ? Date.now() > new Date(expiresAt).getTime() : false;
                setGlobalDebugAccessEnabled(enabled && !expired);
              }
            }
          }
        } catch {}
      })();

      // Restore persisted unlock timestamp so lockIfNeeded() respects the grace period
      // across full app restarts, not just background/foreground transitions.
      const persistedTs = await readUnlockedAt(userId);
      unlockedAtRef.current = persistedTs;
      setUnlockedAtMs(persistedTs);
      logger.log('[Auth] unlockedAt restored:', persistedTs);

      // Always attempt push token registration on load — the OS prompt only appears
      // once, and subsequent calls return the cached token immediately.
      // We do NOT gate this on push_notifications_enabled because that flag starts
      // false and would never let us prompt the user the first time.
      registerForPushNotifications().then(token => {
        if (token) savePushToken(userId, token);
        // Save a non-sensitive diagnostic snapshot after every session start.
        const email = currentSession?.user?.email ?? null;
        saveDiagnosticsSnapshot(userId, email, {
          authStatus: 'authenticated',
          pushTokenStatus: token ? 'registered' : 'not registered',
          currentRoute: 'app (post-login)',
        });
      });

      // Log the Supabase user ID into RevenueCat so server-side verification can
      // look up this subscriber by their Supabase UUID.
      logInRevenueCat(userId);

      // Load subscription info — fire after other data so we don't block the UI gate
      if (accessToken) {
        fetchEffectiveSubscription(accessToken).then(async info => {
          let result = info;
          const adminOverride = await applyAdminOverrideAsync(result, userId);
          if (adminOverride !== result) {
            logger.log('[Auth] admin override applied — canInvite forced true');
            result = adminOverride;
          }
          const grantFallback = await applyEntitlementGrantFallbackAsync(result, userId);
          if (grantFallback !== result) {
            logger.log('[Auth] entitlement grant fallback applied — canInvite forced true');
            result = grantFallback;
          }
          setSubscriptionInfo(result);
        });
      } else {
        logger.log('[Auth] no accessToken — subscription set to default (not loading)');
        setSubscriptionInfo({ ...DEFAULT_SUBSCRIPTION_INFO, loading: false });
      }
    } catch (err) {
      console.warn('[Auth] loadUserData error:', err);
      // Network or unexpected error — don't wipe already-loaded state.
      setSubscriptionInfo({ ...DEFAULT_SUBSCRIPTION_INFO, loading: false });
    } finally {
      logger.log('[Auth] loadUserData done — setLoading(false)');
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
    // Single query that covers all three cases the previous sequential
    // fallbacks handled:
    //   1. Solo/invite-pending row owned by this user (user_b_id IS NULL)
    //   2. Active paired couple where this user is user_a or user_b
    //   3. Any active couple involving this user (edge-case catch-all)
    // We OR the conditions and order so the best row comes first:
    //   - user_b_id IS NULL (solo/pending) before paired rows
    //   - active=true before active=false
    //   - most recently created first
    // .maybeSingle() returns the top row or null in one round-trip.
    const { data, error } = await supabase
      .from('couples')
      .select('*')
      .or(`user_a_id.eq.${userId},user_b_id.eq.${userId}`)
      .order('user_b_id', { ascending: true, nullsFirst: true })
      .order('active', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Only update state if the query succeeded. A network error or unexpected
    // PostgREST error returns error!=null and data=null — in that case keep
    // whatever is already in state rather than blanking the couple and
    // sending the user to the /pair screen.
    if (!error) {
      setCouple(data);
      coupleInitialLoadDoneRef.current = true;
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
  // partner joined, partner subscribed), re-fetch so the UI always reflects current
  // data without needing a manual pull-to-refresh or screen focus event.
  useEffect(() => {
    if (!couple?.id) return;
    const channel = supabase
      .channel(`couple:${couple.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'couples', filter: `id=eq.${couple.id}` },
        async (payload: any) => {
          if (!user) return;
          const newUserBId: string | null = payload?.new?.user_b_id ?? null;
          // Detect User A's partner joining: user_b_id went from null to populated,
          // this user is User A, AND the initial load has already completed.
          // The coupleInitialLoadDoneRef guard prevents a false positive on every app
          // open: without it, couple starts null, fetchCouple populates user_b_id,
          // and the realtime channel sees null→value as if the partner just joined.
          const isUserA = couple.user_a_id === user.id;
          const wasAlreadyPaired = !!couple.user_b_id;
          const partnerJustJoined =
            coupleInitialLoadDoneRef.current &&
            isUserA &&
            !wasAlreadyPaired &&
            !!newUserBId;
          await fetchCouple(user.id);
          if (partnerJustJoined) {
            const { data: partnerProf } = await supabase
              .from('profiles')
              .select('display_name')
              .eq('id', newUserBId)
              .maybeSingle();
            setJustPairedPartnerName(partnerProf?.display_name ?? '');
          }
          // If subscription_owner_id changed, one partner just subscribed (or
          // unsubscribed). Refresh subscription so the non-subscribing partner's
          // app updates immediately — either gaining partner-shared premium or
          // losing it.
          const newSubOwner = payload?.new?.subscription_owner_id ?? null;
          const oldSubOwner = payload?.old?.subscription_owner_id ?? null;
          if (newSubOwner !== oldSubOwner) {
            logger.log('[Auth] subscription_owner_id changed via realtime — refreshing subscription');
            refreshSubscription().catch(() => {});
          }
        },
      )
      .subscribe();

    // Also subscribe to partner's profile changes so avatar updates are reflected live.
    const partnerId = couple.user_a_id === user?.id ? couple.user_b_id : couple.user_a_id;
    const profileChannel = partnerId
      ? supabase
          .channel(`partner_profile:${partnerId}`)
          .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${partnerId}` },
            async () => {
              const { data } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', partnerId)
                .maybeSingle();
              if (data) setPartnerProfile(data);
            },
          )
          .subscribe()
      : null;

    return () => {
      supabase.removeChannel(channel);
      if (profileChannel) supabase.removeChannel(profileChannel);
    };
  }, [couple?.id, couple?.user_b_id, user?.id]);

  // Realtime fallback: when a partner sends something (chat, dare/dice/ask,
  // vault upload, wish) and a push doesn't arrive or arrives late, play the
  // subtle incoming slash. Only fires while the app is in the foreground;
  // backgrounded/locked events are handled by the push tap-to-navigate flow.
  useEffect(() => {
    if (!couple?.id || !user?.id) return;
    const partnerId = couple.user_a_id === user.id ? couple.user_b_id : couple.user_a_id;
    if (!partnerId) return;

    const isForeground = () => AppState.currentState === 'active';

    const incomingChannel = supabase
      .channel(`incoming:${couple.id}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `couple_id=eq.${couple.id}` },
        (payload: any) => {
          if (!isForeground()) return;
          if (payload?.new?.sender_id === user.id) return;
          emitIncoming();
        })
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'interactions', filter: `couple_id=eq.${couple.id}` },
        (payload: any) => {
          if (!isForeground()) return;
          if (payload?.new?.sender_id === user.id) return;
          emitIncoming();
        })
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'vault_items', filter: `couple_id=eq.${couple.id}` },
        (payload: any) => {
          if (!isForeground()) return;
          if (payload?.new?.uploaded_by_user_id === user.id) return;
          emitIncoming();
        })
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'wishes', filter: `couple_id=eq.${couple.id}` },
        (payload: any) => {
          if (!isForeground()) return;
          if (payload?.new?.created_by_user_id === user.id) return;
          emitIncoming();
        })
      .subscribe();

    return () => {
      supabase.removeChannel(incomingChannel);
    };
  }, [couple?.id, user?.id]);

  const patchCouple = useCallback((patch: Partial<Couple>) => {
    setCouple(prev => prev ? { ...prev, ...patch } : prev);
  }, []);

  const clearJustPaired = useCallback(() => setJustPairedPartnerName(null), []);

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
      logOutRevenueCat().catch(() => {});
    }
    clearAppBadge().catch(() => {});
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

  const lockApp = useCallback(() => {
    setAppLocked(true);
    // Reset vault unlock so the additional Face ID prompt re-fires after an app re-lock.
    setVaultUnlocked(false);
  }, []);

  const lockIfNeeded = useCallback((): boolean => {
    const shouldLock = computeIsUnlockRequired(settings, unlockedAtRef.current);
    if (shouldLock) setAppLocked(true);
    return shouldLock;
  }, [settings]);

  const refreshSubscription = useCallback(async () => {
    const { data: { session: currentSession } } = await supabase.auth.getSession();
    const accessToken = currentSession?.access_token ?? '';
    if (!accessToken) return;
    const userId = currentSession?.user?.id ?? '';
    setSubscriptionInfo(prev => ({ ...prev, loading: true }));
    const info = await fetchEffectiveSubscription(accessToken);
    let result = info;
    const adminOverride = await applyAdminOverrideAsync(result, userId);
    if (adminOverride !== result) result = adminOverride;
    const grantFallback = await applyEntitlementGrantFallbackAsync(result, userId);
    if (grantFallback !== result) result = grantFallback;
    setSubscriptionInfo(result);
  }, []);

  const isAdmin = profile?.is_admin === true;
  const isSuperAdmin = profile?.is_super_admin === true;

  return (
    <AuthContext.Provider
      value={{ session, user, profile, couple, partnerProfile, settings, loading, isAdmin, isSuperAdmin, subscriptionInfo, refreshSubscription, appLocked, unlockApp, lockApp, lockIfNeeded, unlockedAtMs, refreshCouple, patchCouple, refreshSettings, refreshProfile, signOut, isAuthenticatingRef, vaultUnlocked, setVaultUnlocked, debugModeEnabled, globalDebugAccessEnabled, justPairedPartnerName, clearJustPaired, scoreResetAt, notifyScoreReset: () => setScoreResetAt(n => n + 1) }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
