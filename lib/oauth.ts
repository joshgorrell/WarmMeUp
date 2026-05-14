import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import { supabase } from './supabase';

try { WebBrowser.maybeCompleteAuthSession(); } catch {}

export async function signInWithProvider(provider: 'google' | 'apple') {
  // Web: standard browser redirect — Supabase handles the callback via
  // detectSessionInUrl. Returns null because the page will navigate away.
  if (Platform.OS === 'web') {
    const redirectTo = window.location.origin + '/auth/callback';
    await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo },
    });
    return null;
  }

  // Native: deep-link flow
  const redirectTo = makeRedirectUri({ scheme: 'warmup', path: 'auth/callback' });

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo,
      skipBrowserRedirect: true,
    },
  });

  if (error || !data.url) {
    throw error ?? new Error('Could not initiate sign-in');
  }

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

  if (result.type === 'success' && result.url) {
    const url = new URL(result.url);
    const params = new URLSearchParams(
      url.hash ? url.hash.slice(1) : url.search.slice(1)
    );
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');

    if (accessToken && refreshToken) {
      const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (sessionError) throw sessionError;
      return sessionData;
    }
  }

  if (result.type === 'cancel' || result.type === 'dismiss') {
    return null;
  }

  throw new Error('Sign-in was not completed.');
}

// Google is supported on all platforms; Apple only on native
export function isOAuthSupported(provider?: 'google' | 'apple'): boolean {
  if (provider === 'apple') return Platform.OS !== 'web';
  return true;
}
