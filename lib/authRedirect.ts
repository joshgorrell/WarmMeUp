import { Platform } from 'react-native';

export function authRedirectUrl(recovery = false): string {
  const base = Platform.OS === 'web' && typeof window !== 'undefined'
    ? `${window.location.origin}/auth/callback`
    : 'warmup://auth/callback';
  return recovery ? `${base}?recovery=1` : base;
}

export function parseAuthCallback(url: string) {
  const parsed = new URL(url);
  const params = new URLSearchParams(parsed.search);
  new URLSearchParams(parsed.hash.slice(1)).forEach((value, key) => params.set(key, value));
  return {
    accessToken: params.get('access_token'),
    refreshToken: params.get('refresh_token'),
    code: params.get('code'),
    recovery: params.get('type') === 'recovery' || params.get('recovery') === '1',
    error: params.get('error_description') || params.get('error'),
  };
}
