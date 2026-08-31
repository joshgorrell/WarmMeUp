import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

// Custom storage adapter — uses SecureStore on native, sessionStorage on web.
// This ensures the auth session persists across app restarts on native.
const customStorage = {
  getItem: async (key: string): Promise<string | null> => {
    if (Platform.OS !== 'web') {
      return await SecureStore.getItemAsync(key);
    }
    if (typeof window !== 'undefined' && window.sessionStorage) {
      return window.sessionStorage.getItem(key);
    }
    return null;
  },
  setItem: async (key: string, value: string): Promise<void> => {
    if (Platform.OS !== 'web') {
      await SecureStore.setItemAsync(key, value);
    } else if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.setItem(key, value);
    }
  },
  removeItem: async (key: string): Promise<void> => {
    if (Platform.OS !== 'web') {
      await SecureStore.deleteItemAsync(key);
    } else if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.removeItem(key);
    }
  },
};

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: customStorage as any,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export interface SupabaseDiagnostics {
  clientHasAnonKey: boolean;
  clientAnonKeyLength: number;
  sourcesMatch: boolean;
}

export function getSupabaseDiagnostics(): SupabaseDiagnostics {
  const authHeaders = (supabase.auth as any)?.headers ?? {};
  const clientKey = authHeaders.apikey ?? '';
  const envKey = supabaseAnonKey;
  return {
    clientHasAnonKey: Boolean(clientKey),
    clientAnonKeyLength: clientKey.length,
    sourcesMatch: clientKey === envKey,
  };
}
