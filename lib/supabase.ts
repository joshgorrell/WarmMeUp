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

// ─── Network interceptor ───────────────────────────────────────────────────
// Patches globalThis.fetch to log every outgoing request to the Supabase URL.
// This is the ground truth: it runs AFTER supabase-js builds and attaches all
// headers, so if apikey is missing here it is missing on the wire.
// Active in all builds until the auth issue is resolved.
const _origFetch = globalThis.fetch;
globalThis.fetch = function supabaseDebugFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const url =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.href
        : (input as Request).url;

  if (supabaseUrl && url.startsWith(supabaseUrl)) {
    // Flatten headers to a plain object regardless of their type.
    const rawHeaders = init?.headers;
    const flat: Record<string, string> = {};
    if (rawHeaders instanceof Headers) {
      rawHeaders.forEach((v, k) => { flat[k] = v; });
    } else if (Array.isArray(rawHeaders)) {
      for (const [k, v] of rawHeaders) flat[k] = v;
    } else if (rawHeaders && typeof rawHeaders === 'object') {
      Object.assign(flat, rawHeaders);
    }

    const hasApiKey = Boolean(flat['apikey'] ?? flat['Apikey']);
    const hasAuth   = Boolean(flat['authorization'] ?? flat['Authorization']);
    const authPfx   = (flat['authorization'] ?? flat['Authorization'] ?? '').slice(0, 40);

    console.log('[FetchInterceptor] →', init?.method ?? 'GET', url.replace(supabaseUrl, '<SB>'));
    console.log('[FetchInterceptor] hasApiKey:', hasApiKey, '| apikey len:', (flat['apikey'] ?? flat['Apikey'] ?? '').length);
    console.log('[FetchInterceptor] hasAuth:',   hasAuth,   '| auth pfx:', authPfx || '(none)');
    console.log('[FetchInterceptor] allHeaderKeys:', Object.keys(flat).join(', ') || '(none)');

    if (!hasApiKey) {
      console.error('[FetchInterceptor] *** NO apikey HEADER — this request WILL fail with "No API key found" ***');
      console.error('[FetchInterceptor] init.headers type:', Object.prototype.toString.call(rawHeaders));
      console.error('[FetchInterceptor] full flat headers:', JSON.stringify(flat));
    }
  }

  return _origFetch.call(globalThis, input, init);
} as typeof fetch;
// ──────────────────────────────────────────────────────────────────────────

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
    // No custom fetch: supabase-js will use globalThis.fetch, which is wrapped
    // by our debug interceptor above.
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
    fetchWrapper: 'interceptor-v25',
    // Auth client internal header state (sampled at call time)
    authClientHasApiKey: Boolean(authHeaders['apikey']),
    authClientAnonKeyLength: (authHeaders['apikey'] ?? '').length,
    authClientUrl: authInternal?.url ?? 'UNKNOWN',
    authClientHeaderKeys: Object.keys(authHeaders).join(', ') || '(none)',
    // Fetch config: no custom fetch passed to createClient — relies on globalThis.fetch
    // which is wrapped by our supabaseDebugFetch interceptor at module load time.
    clientCustomFetch: 'none (uses globalThis.fetch via interceptor)',
    interceptorActive: globalThis.fetch !== _origFetch,
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
