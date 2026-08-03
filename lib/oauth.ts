import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import * as AppleAuthentication from 'expo-apple-authentication';
import { supabase } from './supabase';

try { WebBrowser.maybeCompleteAuthSession(); } catch {}

export async function signInWithProvider(provider: 'google' | 'apple') {
  if (provider === 'apple' && Platform.OS === 'ios') {
    return signInWithAppleNative();
  }

  // Web (all providers) and native Google: browser redirect flow
  if (Platform.OS === 'web') {
    const redirectTo = window.location.origin + '/auth/callback';
    await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo },
    });
    return null;
  }

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

async function signInWithAppleNative() {
  const isAvailable = await AppleAuthentication.isAvailableAsync();
  if (!isAvailable) {
    throw new Error('Sign in with Apple is not available on this device.');
  }

  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
  } catch (e: any) {
    if (e?.code === 'ERR_REQUEST_CANCELED' || e?.name === 'ERR_REQUEST_CANCELED') {
      return null;
    }
    throw e;
  }

  if (!credential.identityToken) {
    throw new Error('Apple did not return an identity token.');
  }

  // Capture the user's name — Apple only provides it on the very first sign-in.
  const givenName = credential.fullName?.givenName;
  const familyName = credential.fullName?.familyName;
  const userData: Record<string, string> = {};
  if (givenName) userData.first_name = givenName;
  if (familyName) userData.last_name = familyName;
  if (givenName || familyName) {
    userData.full_name = [givenName, familyName].filter(Boolean).join(' ');
  }

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
  });

  if (error) throw error;

  // Persist Apple-provided name to user metadata so the register flow can pick it up.
  if (data.user && Object.keys(userData).length > 0) {
    await supabase.auth.updateUser({ data: userData }).catch(() => {});
  }

  return data;
}

// Google is supported on all platforms; Apple only on native
export function isOAuthSupported(provider?: 'google' | 'apple'): boolean {
  if (provider === 'apple') return Platform.OS === 'ios';
  return true;
}
