export const APP_CODE_VERSION = 'auth-session-probe-2026-06-17-v28';
export const OTA_MARKER = 'OTA V28 AUTH SESSION PROBE 2026-06-17';

// Injected by EAS at build time via EXPO_PUBLIC_GIT_SHA env var.
// Will be null in dev / older builds that predate this change.
export const GIT_SHA: string | null =
  (process.env.EXPO_PUBLIC_GIT_SHA ?? null) || null;
