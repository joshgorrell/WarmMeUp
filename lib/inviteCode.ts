import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const CODE_ALPHABET = 'ACDEFGHJKLMNPQRTUVWXY34679';
const CODE_LENGTH = 6;
const PENDING_CODE_KEY = 'warmup_pending_invite_code';

export function generateInviteCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

export function validateCodeFormat(code: string): boolean {
  if (code.length !== CODE_LENGTH) return false;
  return code.split('').every(c => CODE_ALPHABET.includes(c));
}

// ─── Pending code persistence ────────────────────────────────────────────────
// Stored in SecureStore/localStorage so it survives OAuth redirects and app restarts.

export async function savePendingCode(code: string): Promise<void> {
  try {
    if (Platform.OS !== 'web') {
      await SecureStore.setItemAsync(PENDING_CODE_KEY, code);
    } else if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(PENDING_CODE_KEY, code);
    }
  } catch {}
}

export async function loadPendingCode(): Promise<string | null> {
  try {
    if (Platform.OS !== 'web') {
      return await SecureStore.getItemAsync(PENDING_CODE_KEY);
    } else if (typeof window !== 'undefined') {
      return window.sessionStorage.getItem(PENDING_CODE_KEY);
    }
  } catch {}
  return null;
}

export async function clearPendingCode(): Promise<void> {
  try {
    if (Platform.OS !== 'web') {
      await SecureStore.deleteItemAsync(PENDING_CODE_KEY);
    } else if (typeof window !== 'undefined') {
      window.sessionStorage.removeItem(PENDING_CODE_KEY);
    }
  } catch {}
}
