export const APP_CODE_VERSION = 'fix-chat-photo-rendering-v47-2026-06-18';
export const OTA_MARKER = 'OTA V47 FIX CHAT PHOTO RENDERING 2026-06-18';

// Injected by EAS at build time via EXPO_PUBLIC_GIT_SHA env var.
// Will be null in dev / older builds that predate this change.
export const GIT_SHA: string | null =
  (process.env.EXPO_PUBLIC_GIT_SHA ?? null) || null;
