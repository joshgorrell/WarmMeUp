import { Platform } from 'react-native';
import { logger } from '@/lib/logger';

type PurchasesModule = any;

let purchasesInstance: PurchasesModule | null = null;
let configuredUserId: string | null = null;

function getApiKey(): string | null {
  if (Platform.OS === 'ios') {
    return process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY || null;
  }
  if (Platform.OS === 'android') {
    return process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY || null;
  }
  return null;
}

/**
 * Initialize the RevenueCat SDK if not already configured.
 * Returns the Purchases module instance, or null if unavailable (e.g. web
 * or missing API key).
 */
export async function ensureConfigured(): Promise<PurchasesModule | null> {
  if (purchasesInstance) return purchasesInstance;
  if (Platform.OS === 'web') return null;

  const apiKey = getApiKey();
  if (!apiKey) {
    logger.log('[Purchases] no API key configured for platform:', Platform.OS);
    return null;
  }

  try {
    const Purchases = (await import('react-native-purchases')).default;
    await Purchases.configure({ apiKey });
    purchasesInstance = Purchases;
    logger.log('[Purchases] configured successfully');
    return purchasesInstance;
  } catch (e: any) {
    logger.warn('[Purchases] configure failed:', e?.message);
    return null;
  }
}

/**
 * Configure RevenueCat with a specific user ID (app user ID).
 * If already configured with the same user, returns the existing instance.
 * If configured with a different user, calls logIn to switch.
 */
export async function ensureRevenueCatUser(userId: string): Promise<PurchasesModule | null> {
  if (Platform.OS === 'web') return null;

  const apiKey = getApiKey();
  if (!apiKey) return null;

  // Already configured with the same user
  if (purchasesInstance && configuredUserId === userId) {
    return purchasesInstance;
  }

  try {
    if (!purchasesInstance) {
      const Purchases = (await import('react-native-purchases')).default;
      await Purchases.configure({ apiKey, appUserID: userId });
      purchasesInstance = Purchases;
      configuredUserId = userId;
      logger.log('[Purchases] configured with user:', userId);
    } else {
      // Already configured — switch user via logIn
      const { customerInfo } = await purchasesInstance.logIn(userId);
      configuredUserId = userId;
      logger.log('[Purchases] logged in user:', userId);
    }
    return purchasesInstance;
  } catch (e: any) {
    logger.warn('[Purchases] ensureRevenueCatUser failed:', e?.message);
    return null;
  }
}

/**
 * Log out the current RevenueCat user (call on sign-out).
 */
export async function logOutRevenueCat(): Promise<void> {
  if (!purchasesInstance || Platform.OS === 'web') return;
  try {
    await purchasesInstance.logOut();
    configuredUserId = null;
    logger.log('[Purchases] logged out');
  } catch (e: any) {
    logger.warn('[Purchases] logOut failed:', e?.message);
  }
}

/**
 * Log in a RevenueCat user after sign-in (alias for ensureRevenueCatUser).
 */
export async function logInRevenueCat(userId: string): Promise<void> {
  await ensureRevenueCatUser(userId);
}
