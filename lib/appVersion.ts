export const APP_CODE_VERSION = 'remove-fetch-interceptor-v35-2026-06-17';
export const OTA_MARKER = 'OTA V35 REMOVE FETCH INTERCEPTOR 2026-06-17';

// Injected by EAS at build time via EXPO_PUBLIC_GIT_SHA env var.
// Will be null in dev / older builds that predate this change.
export const GIT_SHA: string | null =
  (process.env.EXPO_PUBLIC_GIT_SHA ?? null) || null;
