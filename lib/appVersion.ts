export const APP_CODE_VERSION = 'auth-network-header-debug-v25';
export const OTA_MARKER = 'V25 AUTH NETWORK HEADER DEBUG';

// Injected by EAS at build time via EXPO_PUBLIC_GIT_SHA env var.
// Will be null in dev / older builds that predate this change.
export const GIT_SHA: string | null =
  (process.env.EXPO_PUBLIC_GIT_SHA ?? null) || null;
