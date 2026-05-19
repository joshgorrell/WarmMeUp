import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Platform } from 'react-native';
import { supabase } from '@/lib/supabase';

export type SubscriptionPlan = 'Free' | 'Monthly' | 'Annual';
export type SubscriptionStatus = 'Active' | 'Inactive' | 'Trial';
export type SubscriptionSource = 'self' | 'partner' | 'none';

interface SubscriptionState {
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  isOnTrial: boolean;
  isPremium: boolean;
  premiumSource: SubscriptionSource;
  renewalDate: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
  restorePurchases: () => Promise<void>;
  openManageSubscription: () => Promise<void>;
}

function formatDate(dateString: string | null): string | null {
  if (!dateString) return null;
  try {
    return new Date(dateString).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return null;
  }
}

function derivePlan(productIdentifier: string | undefined): SubscriptionPlan {
  if (!productIdentifier) return 'Free';
  const id = productIdentifier.toLowerCase();
  if (id.includes('annual') || id.includes('yearly') || id.includes('year')) return 'Annual';
  if (id.includes('monthly') || id.includes('month')) return 'Monthly';
  return 'Monthly';
}

async function fetchEffectiveSubscription(): Promise<{
  isPremium: boolean;
  source: SubscriptionSource;
  plan: string | null;
  expiresAt: string | null;
} | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;

    const baseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
    if (!baseUrl.startsWith('https://')) return null;

    const res = await fetch(`${baseUrl}/functions/v1/get-effective-subscription`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        Apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export function useSubscription(): SubscriptionState {
  const [plan, setPlan] = useState<SubscriptionPlan>('Free');
  const [status, setStatus] = useState<SubscriptionStatus>('Inactive');
  const [isOnTrial, setIsOnTrial] = useState(false);
  const [isPremium, setIsPremium] = useState(false);
  const [premiumSource, setPremiumSource] = useState<SubscriptionSource>('none');
  const [renewalDate, setRenewalDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchCustomerInfo = useCallback(async () => {
    setLoading(true);
    try {
      // Primary: server-authoritative check via Edge Function (handles partner sharing)
      const effective = await fetchEffectiveSubscription();
      if (effective?.isPremium) {
        setIsPremium(true);
        setPremiumSource(effective.source);
        setRenewalDate(formatDate(effective.expiresAt));
        const serverPlan = effective.plan ?? '';
        if (serverPlan === 'yearly' || serverPlan === 'annual') setPlan('Annual');
        else if (serverPlan === 'monthly') setPlan('Monthly');
        else setPlan('Monthly');
        setStatus('Active');
        setIsOnTrial(false);
        return;
      }

      // Secondary: RevenueCat receipt check (native only, own subscription)
      if (Platform.OS !== 'web') {
        try {
          const Purchases = (await import('react-native-purchases')).default;
          const apiKey = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY;
          if (apiKey) {
            Purchases.configure({ apiKey });
            const info = await Purchases.getCustomerInfo();
            const entitlement = info.entitlements.active['premium'];
            if (entitlement) {
              const onTrial = entitlement.periodType === 'TRIAL';
              setIsOnTrial(onTrial);
              setStatus(onTrial ? 'Trial' : 'Active');
              setPlan(derivePlan(entitlement.productIdentifier));
              setRenewalDate(formatDate(entitlement.expirationDate));
              setIsPremium(true);
              setPremiumSource('self');
              return;
            }
          }
        } catch {
          // RevenueCat unavailable — fall through to inactive state
        }
      }

      // No active subscription from either source
      setPlan('Free');
      setStatus('Inactive');
      setIsOnTrial(false);
      setIsPremium(false);
      setPremiumSource('none');
      setRenewalDate(null);
    } catch {
      setPlan('Free');
      setStatus('Inactive');
      setIsOnTrial(false);
      setIsPremium(false);
      setPremiumSource('none');
      setRenewalDate(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchCustomerInfo();
  }, [fetchCustomerInfo]);

  const restorePurchases = useCallback(async () => {
    if (Platform.OS === 'web') {
      Alert.alert('Not Available', 'Purchase restoration is only available on iOS.');
      return;
    }
    try {
      const Purchases = (await import('react-native-purchases')).default;
      const info = await Purchases.restorePurchases();
      const entitlement = info.entitlements.active['premium'];
      if (entitlement) {
        const onTrial = entitlement.periodType === 'TRIAL';
        setIsOnTrial(onTrial);
        setStatus(onTrial ? 'Trial' : 'Active');
        setPlan(derivePlan(entitlement.productIdentifier));
        setRenewalDate(formatDate(entitlement.expirationDate));
        setIsPremium(true);
        setPremiumSource('self');
        Alert.alert('Purchases Restored', 'Your subscription has been restored.');
      } else {
        Alert.alert('No Purchases Found', 'No active subscription was found for your account.');
      }
    } catch (e: any) {
      Alert.alert('Restore Failed', e?.message ?? 'Could not restore purchases. Please try again.');
    }
  }, []);

  const openManageSubscription = useCallback(async () => {
    await Linking.openURL('https://apps.apple.com/account/subscriptions');
  }, []);

  return {
    plan,
    status,
    isOnTrial,
    isPremium,
    premiumSource,
    renewalDate,
    loading,
    refresh: fetchCustomerInfo,
    restorePurchases,
    openManageSubscription,
  };
}
