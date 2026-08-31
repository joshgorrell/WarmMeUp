import { Platform } from 'react-native';

/**
 * RevenueCat product IDs — must match App Store Connect / Google Play Console.
 * Read from environment variables with fallbacks.
 */
export const MONTHLY_PRODUCT_ID: string =
  Platform.OS === 'android'
    ? (process.env.EXPO_PUBLIC_RC_ANDROID_MONTHLY_ID ?? 'warmmeup_monthly_999')
    : (process.env.EXPO_PUBLIC_RC_IOS_MONTHLY_ID ?? 'warmmeup_monthly_999');

export const ANNUAL_PRODUCT_ID: string =
  Platform.OS === 'android'
    ? (process.env.EXPO_PUBLIC_RC_ANDROID_ANNUAL_ID ?? 'warmmeup_annual_9999')
    : (process.env.EXPO_PUBLIC_RC_IOS_ANNUAL_ID ?? 'warmmeup_annual_9999');

/**
 * Map a RevenueCat product ID to a plan name ('monthly' | 'yearly').
 */
export function planFromProductId(productId: string): 'monthly' | 'yearly' | null {
  if (productId === MONTHLY_PRODUCT_ID) return 'monthly';
  if (productId === ANNUAL_PRODUCT_ID) return 'yearly';
  // Fallback: check by suffix
  if (productId.includes('monthly')) return 'monthly';
  if (productId.includes('annual') || productId.includes('yearly')) return 'yearly';
  return null;
}
