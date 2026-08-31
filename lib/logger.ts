/**
 * Gated logger — all console output is suppressed in production.
 * Set EXPO_PUBLIC_DEBUG_ALWAYS_ON=1 to enable verbose logging.
 */

const DEBUG = process.env.EXPO_PUBLIC_DEBUG_ALWAYS_ON === '1';

export const logger = {
  log: (...args: unknown[]): void => {
    if (DEBUG) console.log(...args);
  },
  warn: (...args: unknown[]): void => {
    if (DEBUG) console.warn(...args);
  },
  error: (...args: unknown[]): void => {
    // Errors are always logged — they indicate real problems
    console.error(...args);
  },
  debug: (...args: unknown[]): void => {
    if (DEBUG) console.debug(...args);
  },
  info: (...args: unknown[]): void => {
    if (DEBUG) console.info(...args);
  },
};
