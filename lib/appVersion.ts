export const APP_CODE_VERSION = 'chat-fixes-v2-2026-06-21';
export const OTA_MARKER = 'OTA CHAT FIXES V2 2026-06-21';

// Injected by EAS at build time via EXPO_PUBLIC_GIT_SHA env var.
// Will be null in dev / older builds that predate this change.
export const GIT_SHA: string | null =
  (process.env.EXPO_PUBLIC_GIT_SHA ?? null) || null;
