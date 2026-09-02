/**
 * Gated logger — all console output is suppressed in production builds.
 * Verbose logging is enabled automatically in development (__DEV__).
 */

const DEBUG = typeof __DEV__ !== 'undefined' ? __DEV__ : false;

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
