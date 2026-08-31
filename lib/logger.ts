type LogArgs = unknown[];

export const logger = {
  log: (...args: LogArgs): void => {
    console.log('[WarmMeUp]', ...args);
  },
  warn: (...args: LogArgs): void => {
    console.warn('[WarmMeUp]', ...args);
  },
  error: (...args: LogArgs): void => {
    console.error('[WarmMeUp]', ...args);
  },
  debug: (...args: LogArgs): void => {
    if (__DEV__) {
      console.debug('[WarmMeUp]', ...args);
    }
  },
};
