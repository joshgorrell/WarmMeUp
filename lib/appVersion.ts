export const APP_CODE_VERSION = 'feat-content-deleted-activity-event-v48-2026-06-18';
export const OTA_MARKER = 'OTA V48 FEAT CONTENT DELETED IN APP ACTIVITY NOTIFICATION 2026-06-18';

// Injected by EAS at build time via EXPO_PUBLIC_GIT_SHA env var.
// Will be null in dev / older builds that predate this change.
export const GIT_SHA: string | null =
  (process.env.EXPO_PUBLIC_GIT_SHA ?? null) || null;
