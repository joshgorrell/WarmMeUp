export const APP_CODE_VERSION = 'ota-live-test-2026-06-15-v15';
export const OTA_MARKER = 'V15 OTA LIVE TEST 2026-06-15';

// Injected by EAS at build time via EXPO_PUBLIC_GIT_SHA env var.
// Will be null in dev / older builds that predate this change.
export const GIT_SHA: string | null =
  (process.env.EXPO_PUBLIC_GIT_SHA ?? null) || null;
