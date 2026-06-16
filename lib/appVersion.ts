export const APP_CODE_VERSION = 'clean-chat-media-bubbles-2026-06-16-v32';
export const OTA_MARKER = 'V32 CLEAN CHAT MEDIA BUBBLES 2026-06-16';

// Injected by EAS at build time via EXPO_PUBLIC_GIT_SHA env var.
// Will be null in dev / older builds that predate this change.
export const GIT_SHA: string | null =
  (process.env.EXPO_PUBLIC_GIT_SHA ?? null) || null;
