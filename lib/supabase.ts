import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { logger } from './logger';

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
  logger.warn('[Supabase] WARNING: anon key had trailing whitespace/newline — trimmed before use');
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

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: storage as any,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
  },
});

// Apple requires Sign in with Apple authorization to be revoked when an account
// is deleted. Existing users do not have a refresh token stored in Warm Me Up,
// so immediately before a self-service deletion on iOS we refresh the native
// Apple credential to obtain a short-lived authorization code. The delete-account
// edge function exchanges that code server-side and revokes the resulting token.
// Admin-initiated deletions intentionally skip this because the admin is not the
// target Apple user.
const originalFunctionsInvoke = supabase.functions.invoke.bind(supabase.functions);
(supabase.functions as any).invoke = async (functionName: string, options: any = {}) => {
  if (functionName === 'delete-account' && Platform.OS === 'ios' && !options?.body?.targetUserId) {
    const { data: { user } } = await supabase.auth.getUser();
    const appleIdentity = user?.identities?.find((identity: any) => identity?.provider === 'apple');

    if (appleIdentity) {
      const appleUserId = appleIdentity?.identity_data?.sub ?? appleIdentity?.id;
      if (!appleUserId) {
        throw new Error('Could not verify your Apple identity for account deletion. Please sign out, sign back in with Apple, and try again.');
      }

      try {
        const AppleAuthentication = await import('expo-apple-authentication');
        const credential = await AppleAuthentication.refreshAsync({ user: appleUserId });
        if (!credential.authorizationCode) {
          throw new Error('Apple did not return the authorization needed to revoke Sign in with Apple. Please try again.');
        }
        options = {
          ...options,
          body: {
            ...(options?.body ?? {}),
            appleAuthorizationCode: credential.authorizationCode,
          },
        };
      } catch (err: any) {
        if (err?.code === 'ERR_REQUEST_CANCELED' || err?.name === 'ERR_REQUEST_CANCELED') {
          throw new Error('Apple authorization is required to securely delete this account. Please try again and approve the Apple prompt.');
        }
        throw err;
      }
    }
  }

  return originalFunctionsInvoke(functionName, options);
};

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
