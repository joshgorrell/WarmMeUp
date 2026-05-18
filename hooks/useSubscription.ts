import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Platform } from 'react-native';

export type SubscriptionPlan = 'Free' | 'Monthly' | 'Annual';
export type SubscriptionStatus = 'Active' | 'Inactive' | 'Trial';

interface SubscriptionState {
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  isOnTrial: boolean;
  renewalDate: string | null;
  loading: boolean;
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

export function useSubscription(): SubscriptionState {
  const [plan, setPlan] = useState<SubscriptionPlan>('Free');
  const [status, setStatus] = useState<SubscriptionStatus>('Inactive');
  const [isOnTrial, setIsOnTrial] = useState(false);
  const [renewalDate, setRenewalDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchCustomerInfo = useCallback(async () => {
    if (Platform.OS === 'web') {
      setLoading(false);
      return;
    }
    try {
      const Purchases = (await import('react-native-purchases')).default;
      const apiKey = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY;
      if (!apiKey) {
        setLoading(false);
        return;
      }
      Purchases.configure({ apiKey });
      const info = await Purchases.getCustomerInfo();
      const entitlement = info.entitlements.active['premium'];
      if (entitlement) {
        const onTrial = entitlement.periodType === 'TRIAL';
        setIsOnTrial(onTrial);
        setStatus(onTrial ? 'Trial' : 'Active');
        setPlan(derivePlan(entitlement.productIdentifier));
        setRenewalDate(formatDate(entitlement.expirationDate));
      } else {
        setPlan('Free');
        setStatus('Inactive');
        setIsOnTrial(false);
        setRenewalDate(null);
      }
    } catch {
      setPlan('Free');
      setStatus('Inactive');
      setIsOnTrial(false);
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

  return { plan, status, isOnTrial, renewalDate, loading, restorePurchases, openManageSubscription };
}
