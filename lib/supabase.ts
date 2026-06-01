import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

// Web uses localStorage so the session actually persists between reloads and
// token refreshes are written back. Native uses expo-secure-store. The previous
// adapter no-opped on web, which silently broke session persistence and any
// subsequent write that depended on a refreshed token.
const webStorage = {
  getItem: (key: string) => {
    try { return window.localStorage.getItem(key); } catch { return null; }
  },
  setItem: (key: string, value: string) => {
    try { window.localStorage.setItem(key, value); } catch {}
  },
  removeItem: (key: string) => {
    try { window.localStorage.removeItem(key); } catch {}
  },
};

const nativeStorage = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

const storage = Platform.OS === 'web' ? webStorage : nativeStorage;

const FETCH_TIMEOUT_MS = 15_000;

function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: storage as any,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
  },
  global: { fetch: fetchWithTimeout as typeof fetch },
});

// Boot-time diagnostics — appear in Metro / device logs before any login attempt.
const _supabaseUrlHost = supabaseUrl ? (() => { try { return new URL(supabaseUrl).hostname; } catch { return null; } })() : null;
const _dbProjectRef = _supabaseUrlHost ? _supabaseUrlHost.replace(/\.supabase\.co$/, '') : null;
console.log('Supabase URL host:', _supabaseUrlHost);
console.log('Supabase project ref:', _dbProjectRef);
console.log('Anon key present:', Boolean(supabaseAnonKey));
console.log('Anon key prefix:', supabaseAnonKey?.slice(0, 12) ?? null);
