export const APP_CODE_VERSION = 'pre-login-debug-2026-06-01-v10';
export const OTA_MARKER = 'V10 WISH ACTIVITY FEED';

// Injected by EAS at build time via EXPO_PUBLIC_GIT_SHA env var.
// Will be null in dev / older builds that predate this change.
export const GIT_SHA: string | null =
  (process.env.EXPO_PUBLIC_GIT_SHA ?? null) || null;
