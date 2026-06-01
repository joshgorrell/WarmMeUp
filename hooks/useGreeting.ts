import { useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { supabase } from '@/lib/supabase';

const KEY_TEXT = 'warmup_last_greeting';
const KEY_TIME = 'warmup_last_greeting_at';
const FALLBACK = 'Everything is set up and waiting.';
const REFRESH_MS = 4 * 60 * 60 * 1000; // 4 hours

async function storeGet(key: string): Promise<string | null> {
  try {
    if (Platform.OS !== 'web') return await SecureStore.getItemAsync(key);
    return window.localStorage.getItem(key);
  } catch { return null; }
}

async function storeSet(key: string, value: string): Promise<void> {
  try {
    if (Platform.OS !== 'web') { await SecureStore.setItemAsync(key, value); return; }
    window.localStorage.setItem(key, value);
  } catch {}
}

async function pickGreeting(): Promise<string> {
  const [storedText, storedTime] = await Promise.all([
    storeGet(KEY_TEXT),
    storeGet(KEY_TIME),
  ]);

  const age = storedTime ? Date.now() - new Date(storedTime).getTime() : Infinity;
  if (storedText && age < REFRESH_MS) return storedText;

  const { data } = await supabase
    .from('greeting_subtitles')
    .select('text')
    .eq('is_active', true);

  if (!data || data.length === 0) return storedText ?? FALLBACK;

  const candidates = data.map(r => r.text as string).filter(t => t !== storedText);
  const pool = candidates.length > 0 ? candidates : data.map(r => r.text as string);
  const next = pool[Math.floor(Math.random() * pool.length)];

  await Promise.all([
    storeSet(KEY_TEXT, next),
    storeSet(KEY_TIME, new Date().toISOString()),
  ]);

  return next;
}

export function useGreeting(): string {
  const [greeting, setGreeting] = useState(FALLBACK);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    pickGreeting().then(setGreeting);

    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      const prev = appStateRef.current;
      appStateRef.current = next;
      if (prev.match(/inactive|background/) && next === 'active') {
        pickGreeting().then(setGreeting);
      }
    });

    return () => sub.remove();
  }, []);

  return greeting;
}
