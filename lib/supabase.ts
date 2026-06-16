import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

// Hard crash guard — if either value is missing the client will silently fail
// on every request with "No API key found". Surface this immediately.
if (!supabaseUrl || !supabaseAnonKey) {
  console.error('[Supabase] FATAL: missing env vars at createClient time');
  console.error('[Supabase] EXPO_PUBLIC_SUPABASE_URL:', supabaseUrl || 'EMPTY');
  console.error('[Supabase] EXPO_PUBLIC_SUPABASE_ANON_KEY length:', supabaseAnonKey.length);
}

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

// Decode the ref claim from a JWT — same logic debug.tsx uses on the env var.
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

// Exportable diagnostic — captures client values at createClient time (module scope).
// These are compared against process.env values read at render time in debug.tsx.
export function getSupabaseDiagnostics() {
  return {
    // Values captured when createClient was called (module init time)
    clientUrl: supabaseUrl || 'EMPTY',
    clientHasAnonKey: supabaseAnonKey.length > 0,
    clientAnonKeyLength: supabaseAnonKey.length,
    clientAnonKeyPrefix24: supabaseAnonKey.slice(0, 24) || 'EMPTY',
    clientAnonKeyProjectRefDecoded: _decodeJwtRef(supabaseAnonKey),
    // Values read from process.env right now (call time) for comparison
    envAnonKeyLength: (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '').length,
    envAnonKeyPrefix24: (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '').slice(0, 24) || 'EMPTY',
    envAnonKeyProjectRefDecoded: _decodeJwtRef(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? ''),
    envUrlHost: (() => { try { return new URL(process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').hostname; } catch { return 'INVALID'; } })(),
    sourcesMatch:
      supabaseAnonKey === (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '') &&
      supabaseUrl === (process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''),
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
