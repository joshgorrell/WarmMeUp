export const APP_CODE_VERSION = 'env-vs-client-source-diag-2026-06-16-v21';
export const OTA_MARKER = 'V21 ENV VS CLIENT SOURCE DIAG 2026-06-16';

// Injected by EAS at build time via EXPO_PUBLIC_GIT_SHA env var.
// Will be null in dev / older builds that predate this change.
export const GIT_SHA: string | null =
  (process.env.EXPO_PUBLIC_GIT_SHA ?? null) || null;
