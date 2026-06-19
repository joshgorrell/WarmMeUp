export const APP_CODE_VERSION = 'feat-gallery-swipe-v48-2026-06-19';
export const OTA_MARKER = 'OTA V48 FEAT GALLERY SWIPE CHAT VAULT 2026-06-19';

// Injected by EAS at build time via EXPO_PUBLIC_GIT_SHA env var.
// Will be null in dev / older builds that predate this change.
export const GIT_SHA: string | null =
  (process.env.EXPO_PUBLIC_GIT_SHA ?? null) || null;
