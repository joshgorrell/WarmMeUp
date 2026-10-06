export const APP_CODE_VERSION = 'security-presence-private-2026-10-06';
export const OTA_MARKER = 'SECURITY: private presence channel + notify-partner vault leak fix';

// Injected by EAS at build time via EXPO_PUBLIC_GIT_SHA env var.
// Will be null in dev / older builds that predate this change.
export const GIT_SHA: string | null =
  (process.env.EXPO_PUBLIC_GIT_SHA ?? null) || null;
