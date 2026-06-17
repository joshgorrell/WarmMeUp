export const APP_CODE_VERSION = 'auth-storage-probe-v32-2026-06-17';
export const OTA_MARKER = 'OTA V32 AUTH SIGNIN SESSION CLEAR PROBE 2026-06-17';

// Injected by EAS at build time via EXPO_PUBLIC_GIT_SHA env var.
// Will be null in dev / older builds that predate this change.
export const GIT_SHA: string | null =
  (process.env.EXPO_PUBLIC_GIT_SHA ?? null) || null;
