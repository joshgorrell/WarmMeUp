import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const _rawUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const _rawAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

const supabaseUrl = _rawUrl.trim();
const supabaseAnonKey = _rawAnonKey.trim();

const anonKeyEndsWithNewline = _rawAnonKey !== supabaseAnonKey;
const anonKeyLengthRaw = _rawAnonKey.length;
const anonKeyLengthTrimmed = supabaseAnonKey.length;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('[Supabase] FATAL: missing env vars at createClient time');
  console.error('[Supabase] EXPO_PUBLIC_SUPABASE_URL:', supabaseUrl || 'EMPTY');
  console.error('[Supabase] EXPO_PUBLIC_SUPABASE_ANON_KEY length:', supabaseAnonKey.length);
}

if (anonKeyEndsWithNewline) {
  console.warn('[Supabase] WARNING: anon key had trailing whitespace/newline — trimmed before use');
}

console.log('[Supabase] anonKeyLengthRaw:', anonKeyLengthRaw);
console.log('[Supabase] anonKeyLengthTrimmed:', anonKeyLengthTrimmed);
console.log('[Supabase] anonKeyEndsWithNewline:', anonKeyEndsWithNewline);
console.log('[Supabase] anonKeyRawJSON:', JSON.stringify(_rawAnonKey.slice(-6)));

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

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: storage as any,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
  },
});

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
  const authInternal = supabase.auth as any;
  const authHeaders: Record<string, string> = authInternal?.headers ?? {};
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
    anonKeyLengthRaw,
    anonKeyLengthTrimmed,
    anonKeyEndsWithNewline,
    anonKeyRawLastCharsJSON: JSON.stringify(_rawAnonKey.slice(-6)),
    fetchWrapper: 'none (interceptor removed v35)',
    authClientHasApiKey: Boolean(authHeaders['apikey']),
    authClientAnonKeyLength: (authHeaders['apikey'] ?? '').length,
    authClientUrl: authInternal?.url ?? 'UNKNOWN',
    authClientHeaderKeys: Object.keys(authHeaders).join(', ') || '(none)',
    clientCustomFetch: 'none',
    interceptorActive: false,
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
