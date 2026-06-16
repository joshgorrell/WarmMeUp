export const APP_CODE_VERSION = 'auth-error-persist-debug-2026-06-16-v23';
export const OTA_MARKER = 'V23 AUTH ERROR PERSIST DEBUG 2026-06-16';

// Injected by EAS at build time via EXPO_PUBLIC_GIT_SHA env var.
// Will be null in dev / older builds that predate this change.
export const GIT_SHA: string | null =
  (process.env.EXPO_PUBLIC_GIT_SHA ?? null) || null;
