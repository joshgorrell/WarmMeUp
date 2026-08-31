import { Platform } from 'react-native';

// Exact App Store / Play Store product identifiers for each plan.
// Set these env vars in your EAS build profile before submitting.
export const IOS_MONTHLY_PRODUCT_ID =
  process.env.EXPO_PUBLIC_RC_IOS_MONTHLY_ID ?? 'warmmeup_monthly_999';
export const IOS_ANNUAL_PRODUCT_ID =
  process.env.EXPO_PUBLIC_RC_IOS_ANNUAL_ID ?? 'warmmeup_annual_9999';
export const ANDROID_MONTHLY_PRODUCT_ID =
  process.env.EXPO_PUBLIC_RC_ANDROID_MONTHLY_ID ?? 'warmmeup_monthly_999';
export const ANDROID_ANNUAL_PRODUCT_ID =
  process.env.EXPO_PUBLIC_RC_ANDROID_ANNUAL_ID ?? 'warmmeup_annual_9999';

export const MONTHLY_PRODUCT_ID =
  Platform.OS === 'android' ? ANDROID_MONTHLY_PRODUCT_ID : IOS_MONTHLY_PRODUCT_ID;
export const ANNUAL_PRODUCT_ID =
  Platform.OS === 'android' ? ANDROID_ANNUAL_PRODUCT_ID : IOS_ANNUAL_PRODUCT_ID;

export function isAnnualProductId(id: string): boolean {
  return id === IOS_ANNUAL_PRODUCT_ID || id === ANDROID_ANNUAL_PRODUCT_ID;
}

export function isMonthlyProductId(id: string): boolean {
  return id === IOS_MONTHLY_PRODUCT_ID || id === ANDROID_MONTHLY_PRODUCT_ID;
}

export function planFromProductId(id: string): 'yearly' | 'monthly' {
  if (isAnnualProductId(id)) return 'yearly';
  return 'monthly';
}
