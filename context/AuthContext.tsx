import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { Session, User } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { supabase } from '@/lib/supabase';
import { Couple, Profile, UserSettings } from '@/lib/types';
import { maybeArchiveAndResetScores } from '@/lib/points';
import { registerForPushNotifications, savePushToken, clearPushToken } from '@/lib/notifications';
import { secureKey } from '@/lib/secureKey';

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
  refreshCouple: () => Promise<void>;
  patchCouple: (patch: Partial<Couple>) => void;
  refreshSettings: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
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
  appLocked: false,
  unlockApp: () => {},
  lockApp: () => {},
  lockIfNeeded: () => true,
  refreshCouple: async () => {},
  patchCouple: () => {},
  refreshSettings: async () => {},
  refreshProfile: async () => {},
  signOut: async () => {},
  isAuthenticatingRef: { current: false },
  vaultUnlocked: false,
  setVaultUnlocked: () => {},
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
      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        // Skip reload on token refreshes — only load on first seen user or a new sign-in.
        if (loadedUserIdRef.current !== session.user.id || event === 'SIGNED_IN') {
          loadedUserIdRef.current = session.user.id;
          (async () => {
            await loadUserData(session.user.id);
          })();
        }
      } else {
        loadedUserIdRef.current = null;
        setProfile(null);
        setCouple(null);
        setPartnerProfile(null);
        setSettings(null);
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
    try {
      const [, , fetchedSettings] = await Promise.all([
        fetchProfile(userId),
        fetchCouple(userId),
        fetchSettings(userId),
      ]);

      // Restore persisted unlock timestamp so lockIfNeeded() respects the grace period
      // across full app restarts, not just background/foreground transitions.
      const persistedTs = await readUnlockedAt(userId);
      unlockedAtRef.current = persistedTs;

      // Register / refresh push token if the user has notifications enabled
      if (fetchedSettings?.push_notifications_enabled) {
        registerForPushNotifications().then(token => {
          if (token) savePushToken(userId, token);
        });
      }
    } catch {
      // Network or unexpected error — don't wipe already-loaded state. The individual
      // fetch functions set their own state on success; leaving existing values in place
      // is safer than blanking the screen. Only unblock loading.
    } finally {
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
    const { data, error } = await supabase
      .from('couples')
      .select('*')
      .or(`user_a_id.eq.${userId},user_b_id.eq.${userId}`)
      .maybeSingle();
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

  const patchCouple = useCallback((patch: Partial<Couple>) => {
    setCouple(prev => prev ? { ...prev, ...patch } : prev);
  }, []);

  const refreshSettings = useCallback(async () => {
    if (user) await fetchSettings(user.id);
  }, [user]);

  const refreshProfile = useCallback(async () => {
    if (user) await fetchProfile(user.id);
  }, [user]);

  const signOut = useCallback(async () => {
    setAppLocked(false);
    setVaultUnlocked(false);
    if (user) {
      clearPushToken(user.id).catch(() => {});
      // Clear the persisted unlock timestamp so next login always prompts for PIN.
      await clearUnlockedAt(user.id);
    }
    unlockedAtRef.current = null;
    await supabase.auth.signOut();
  }, [user]);

  const unlockApp = useCallback(() => {
    const now = Date.now();
    unlockedAtRef.current = now;
    setAppLocked(false);
    // Persist so the grace period survives a full app restart.
    if (user) {
      writeUnlockedAt(user.id, now);
    }
  }, [user]);

  const lockApp = useCallback(() => setAppLocked(true), []);

  /**
   * Locks the app only if the lock_after_seconds timer says we should.
   * Returns true if the lock was engaged, false if still within the grace period.
   * Startup flows (index.tsx, weather.tsx) call this instead of lockApp() directly.
   */
  const lockIfNeeded = useCallback((): boolean => {
    const lockAfter = settings?.lock_after_seconds ?? null;
    // -1 means "never lock"
    if (lockAfter === -1) return false;
    // null means "always lock"
    if (lockAfter === null) {
      setAppLocked(true);
      return true;
    }
    // If the user has never unlocked this session, we must lock
    if (unlockedAtRef.current === null) {
      setAppLocked(true);
      return true;
    }
    const elapsedSeconds = (Date.now() - unlockedAtRef.current) / 1000;
    if (elapsedSeconds >= lockAfter) {
      setAppLocked(true);
      return true;
    }
    // Still within grace period — don't lock
    return false;
  }, [settings?.lock_after_seconds]);

  const isAdmin = profile?.is_admin === true;
  const isSuperAdmin = profile?.is_super_admin === true;

  return (
    <AuthContext.Provider
      value={{ session, user, profile, couple, partnerProfile, settings, loading, isAdmin, isSuperAdmin, appLocked, unlockApp, lockApp, lockIfNeeded, refreshCouple, patchCouple, refreshSettings, refreshProfile, signOut, isAuthenticatingRef, vaultUnlocked, setVaultUnlocked }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
