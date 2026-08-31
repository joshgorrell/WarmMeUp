import * as Crypto from 'expo-crypto';
import { supabase } from '@/lib/supabase';

export interface GlobalDebugStatus {
  enabled: boolean;
  expires_at: string | null;
}

/**
 * Fetches global debug access status via anon-accessible RPC.
 * Safe to call before login. Returns null on any failure.
 */
export async function fetchGlobalDebugStatus(): Promise<GlobalDebugStatus | null> {
  try {
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
    const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
    if (!supabaseUrl || !anonKey) return null;

    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/get_global_debug_status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': anonKey,
        'Authorization': `Bearer ${anonKey}`,
      },
      body: '{}',
    });
    if (!res.ok) return null;
    const data = await res.json();
    return {
      enabled: data?.enabled === true,
      expires_at: data?.expires_at ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Returns true if Global Debug Access is currently enabled and not expired.
 * Can be called with a pre-fetched status or will fetch itself.
 */
export function isGlobalDebugActive(status: GlobalDebugStatus | null): boolean {
  if (!status?.enabled) return false;
  if (status.expires_at) {
    const expiry = new Date(status.expires_at).getTime();
    if (Date.now() > expiry) return false;
  }
  return true;
}

export interface CodeValidationResult {
  valid: boolean;
  reason: 'ok' | 'disabled' | 'expired' | 'wrong_code' | 'not_configured' | 'network_error';
}

/**
 * Validates a 6-digit support code against the server.
 * Accessible to anon users — safe to call before login.
 */
export async function validateDebugSupportCode(
  code: string,
  deviceInfo?: Record<string, string>,
): Promise<CodeValidationResult> {
  try {
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
    const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
    if (!supabaseUrl || !anonKey) {
      return { valid: false, reason: 'network_error' };
    }

    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/validate_debug_support_code`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': anonKey,
        'Authorization': `Bearer ${anonKey}`,
      },
      body: JSON.stringify({
        p_code: code,
        p_device_info: deviceInfo ?? null,
      }),
    });

    if (!res.ok) return { valid: false, reason: 'network_error' };
    const data = await res.json();
    return {
      valid: data?.valid === true,
      reason: data?.reason ?? 'wrong_code',
    };
  } catch {
    return { valid: false, reason: 'network_error' };
  }
}

/**
 * Hashes a plain-text code with SHA-256 and returns the hex string.
 * Used by the admin UI when generating a new support code.
 */
export async function hashSupportCode(code: string): Promise<string> {
  const digest = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    code,
  );
  return digest;
}

/**
 * Generates a cryptographically random 6-digit numeric code.
 */
export function generateSupportCode(): string {
  const bytes = Crypto.getRandomBytes(4);
  const num = ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;
  return String(num % 1000000).padStart(6, '0');
}

/**
 * Admin call: enable/disable Global Debug Access with an optional support code and expiry.
 * Requires an authenticated admin session.
 */
export async function adminSetGlobalDebugAccess(params: {
  enabled: boolean;
  supportCodeHash?: string | null;
  expiresAt?: string | null;
  action?: 'enabled' | 'disabled' | 'code_regenerated';
}): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('admin_set_global_debug_access', {
    p_enabled: params.enabled,
    p_support_code_hash: params.supportCodeHash ?? null,
    p_expires_at: params.expiresAt ?? null,
    p_action: params.action ?? (params.enabled ? 'enabled' : 'disabled'),
  });
  return { error: error?.message ?? null };
}
