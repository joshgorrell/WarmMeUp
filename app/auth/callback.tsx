import { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';

/**
 * Web-only route: /auth/callback
 *
 * After Google (or Apple) OAuth redirects back to the web app, Supabase
 * appends either a code= query param (PKCE) or access_token= fragment.
 * supabase-js with detectSessionInUrl:true handles the exchange automatically,
 * but we still need a route that exists so the redirect isn't a 404.
 *
 * This screen just waits for the session to be established then routes
 * the user into the normal post-login flow.
 */
export default function AuthCallbackScreen() {
  const router = useRouter();

  useEffect(() => {
    // supabase-js will automatically exchange the code / tokens in the URL.
    // We just listen for the resulting session.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session) {
        subscription.unsubscribe();
        // Let index.tsx handle routing (stealth mode, lock gate, etc.)
        router.replace('/');
      }
    });

    // Safety timeout — if no session arrives within 8 s, bail to welcome screen
    const timer = setTimeout(() => {
      subscription.unsubscribe();
      router.replace('/(auth)/welcome');
    }, 8000);

    return () => {
      clearTimeout(timer);
      subscription.unsubscribe();
    };
  }, []);

  return (
    <View style={styles.root}>
      <ActivityIndicator color="#FF5A3D" size="large" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#07070A', alignItems: 'center', justifyContent: 'center' },
});
