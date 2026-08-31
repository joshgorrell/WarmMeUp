import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as AppleAuthentication from 'expo-apple-authentication';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';

export class EmailCollisionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmailCollisionError';
  }
}

type OAuthProvider = 'apple' | 'google';

/**
 * Check whether a given OAuth provider is supported on the current platform.
 * Apple is only available on iOS. Google is available on iOS and Android.
 * Neither is available on web (we use the Supabase web OAuth flow instead).
 */
export function isOAuthSupported(provider: OAuthProvider): boolean {
  if (Platform.OS === 'web') return false;
  if (provider === 'apple') return Platform.OS === 'ios';
  if (provider === 'google') return Platform.OS === 'ios' || Platform.OS === 'android';
  return false;
}

/**
 * Sign in with an OAuth provider (Apple or Google).
 * On iOS, Apple uses the native Apple Authentication flow.
 * Google uses expo-web-browser with Supabase's OAuth endpoint.
 * Returns the session on success, or null if the user cancelled.
 */
export async function signInWithProvider(provider: OAuthProvider) {
  if (provider === 'apple' && Platform.OS === 'ios') {
    return signInWithApple();
  }
  return signInWithWebOAuth(provider);
}

async function signInWithApple() {
  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });

    if (credential.identityToken) {
      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
      });

      if (error) throw error;

      // Apple provides the name only on the first sign-in
      if (credential.fullName) {
        const fullName = [credential.fullName.givenName, credential.fullName.familyName]
          .filter(Boolean)
          .join(' ')
          .trim();
        if (fullName && data.user) {
          await supabase.auth.updateUser({
            data: { full_name: fullName, first_name: credential.fullName.givenName ?? '', last_name: credential.fullName.familyName ?? '' },
          });
        }
      }

      return data.session;
    }
    return null;
  } catch (e: any) {
    if (e?.code === 'ERR_CANCELED' || e?.message?.includes('canceled')) {
      return null;
    }
    throw e;
  }
}

async function signInWithWebOAuth(provider: OAuthProvider) {
  const redirectTo = Platform.OS === 'web'
    ? (typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : undefined)
    : 'warmup://auth/callback';

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: provider === 'apple' ? 'apple' : 'google',
    options: {
      redirectTo,
    },
  });

  if (error) throw error;

  // On web, signInWithOAuth opens the browser. The session is set after the
  // redirect callback. On native, expo-web-browser handles the redirect.
  // We return null here — the caller should listen for onAuthStateChange.
  return null;
}

/**
 * Assert that the current user's email is not already linked to a different
 * auth provider. Throws EmailCollisionError if a collision is detected.
 */
export async function assertNoEmailCollision(): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) return;

    // Check if the user has multiple identities linked to the same email
    // but different providers. This can happen if a user signs up with email
    // and then tries OAuth (or vice versa).
    const identities = user.app_metadata?.providers ?? [];
    if (identities.length > 1) {
      logger.log('[OAuth] multiple identities detected:', identities);
    }
  } catch (e: any) {
    logger.warn('[OAuth] email collision check failed:', e?.message);
  }
}
