export const APP_CODE_VERSION = 'invite-rpc-live-fix-2026-05-31-v4';
export const OTA_MARKER = 'V4 LIVE';

// Injected by EAS at build time via EXPO_PUBLIC_GIT_SHA env var.
// Will be null in dev / older builds that predate this change.
export const GIT_SHA: string | null =
  (process.env.EXPO_PUBLIC_GIT_SHA ?? null) || null;
