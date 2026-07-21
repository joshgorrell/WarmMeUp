import { Platform } from 'react-native';
import { logger } from './logger';

let configured = false;
let configurePromise: Promise<void> | null = null;

async function ensureConfigured(): Promise<typeof import('react-native-purchases').default | null> {
  if (Platform.OS === 'web') return null;

  const iosKey = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY;
  const androidKey = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;
  const apiKey = Platform.OS === 'ios' ? iosKey : androidKey;

  if (!apiKey) {
    console.error(
      `[RevenueCat] Missing API key for platform "${Platform.OS}". ` +
      `Set EXPO_PUBLIC_REVENUECAT_${Platform.OS.toUpperCase()}_KEY in your EAS build environment. ` +
      `Paywall will remain locked.`
    );
    return null;
  }

  if (!configured) {
    if (!configurePromise) {
      configurePromise = (async () => {
        try {
          const Purchases = (await import('react-native-purchases')).default;
          Purchases.configure({ apiKey });
          configured = true;
          logger.log(`[RevenueCat] Configured for platform "${Platform.OS}"`);
        } catch (err: any) {
          logger.warn('[RevenueCat] configure() failed — native module may be unavailable:', err?.message);
        } finally {
          configurePromise = null;
        }
      })();
    }
    await configurePromise;
  }

  if (!configured) return null;
  return (await import('react-native-purchases')).default;
}

async function logInRevenueCat(userId: string): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const Purchases = await ensureConfigured();
    if (!Purchases) return;
    const { created } = await Purchases.logIn(userId);
    logger.log(`[RevenueCat] logIn userId=${userId} created=${created}`);
  } catch (err: any) {
    logger.warn('[RevenueCat] logIn failed:', err?.message);
  }
}

async function logOutRevenueCat(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const Purchases = await ensureConfigured();
    if (!Purchases) return;
    await Purchases.logOut();
    logger.log('[RevenueCat] logged out');
  } catch (err: any) {
    logger.warn('[RevenueCat] logOut failed:', err?.message);
  }
}

export { ensureConfigured, logInRevenueCat, logOutRevenueCat };
