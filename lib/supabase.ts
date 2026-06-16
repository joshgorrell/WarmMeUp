import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('[Supabase] FATAL: missing env vars at createClient time');
  console.error('[Supabase] EXPO_PUBLIC_SUPABASE_URL:', supabaseUrl || 'EMPTY');
  console.error('[Supabase] EXPO_PUBLIC_SUPABASE_ANON_KEY length:', supabaseAnonKey.length);
}

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

// Do NOT pass a custom global.fetch. Every wrapper we have tried (fetchWithTimeout,
// normalizeHeaders) has been the only non-default variable in the call chain and is
// the prime suspect for the persistent "No API key found in request" error on iOS/Android.
// React Native's built-in fetch handles supabase-js Header objects correctly without help.
// Timeout is intentionally removed to eliminate the wrapper as a variable.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: storage as any,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
  },
});

// Decode the ref claim from a JWT.
function _decodeJwtRef(jwt: string): string | null {
  try {
    const parts = jwt.split('.');
    if (parts.length < 2) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const payload = JSON.parse(atob(padded));
    return payload?.ref ?? null;
  } catch {
    return null;
  }
}

export function getSupabaseDiagnostics() {
  return {
    clientUrl: supabaseUrl || 'EMPTY',
    clientHasAnonKey: supabaseAnonKey.length > 0,
    clientAnonKeyLength: supabaseAnonKey.length,
    clientAnonKeyPrefix24: supabaseAnonKey.slice(0, 24) || 'EMPTY',
    clientAnonKeyProjectRefDecoded: _decodeJwtRef(supabaseAnonKey),
    envAnonKeyLength: (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '').length,
    envAnonKeyPrefix24: (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '').slice(0, 24) || 'EMPTY',
    envAnonKeyProjectRefDecoded: _decodeJwtRef(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? ''),
    envUrlHost: (() => { try { return new URL(process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').hostname; } catch { return 'INVALID'; } })(),
    sourcesMatch:
      supabaseAnonKey === (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '') &&
      supabaseUrl === (process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''),
    // V24: no custom global.fetch — using RN's native fetch directly
    fetchWrapper: 'none',
  };
}

const _supabaseUrlHost = supabaseUrl ? (() => { try { return new URL(supabaseUrl).hostname; } catch { return null; } })() : null;
const _dbProjectRef = _supabaseUrlHost ? _supabaseUrlHost.replace(/\.supabase\.co$/, '') : null;
console.log('[Supabase] URL:', supabaseUrl ?? 'MISSING');
console.log('[Supabase] URL host:', _supabaseUrlHost);
console.log('[Supabase] project ref:', _dbProjectRef);
console.log('[Supabase] anon key present:', Boolean(supabaseAnonKey));
console.log('[Supabase] anon key prefix (25):', supabaseAnonKey?.slice(0, 25) ?? 'MISSING');
console.log('[Supabase] anon key length:', supabaseAnonKey?.length ?? 0);
