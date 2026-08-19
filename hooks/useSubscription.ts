import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Platform } from 'react-native';
import { supabase } from '@/lib/supabase';
import { ensureConfigured, ensureRevenueCatUser } from '@/lib/purchases';
import { planFromProductId } from '@/lib/productIds';
import { logger } from '../lib/logger';

export type SubscriptionPlan = 'Free' | 'Monthly' | 'Annual';
export type SubscriptionStatus = 'Active' | 'Inactive' | 'Trial';
export type SubscriptionSource = 'self' | 'partner' | 'none' | 'admin_grant' | 'admin' | 'super_admin';

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

function serverPlanToDisplayPlan(serverPlan: string | null): SubscriptionPlan {
  if (serverPlan === 'yearly' || serverPlan === 'annual') return 'Annual';
  if (serverPlan === 'monthly') return 'Monthly';
  return 'Free';
}

async function fetchEffectiveSubscription(): Promise<{
  isPremium: boolean;
  isOnTrial: boolean;
  source: SubscriptionSource;
  plan: string | null;
  expiresAt: string | null;
  trialExpiresAt: string | null;
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

async function notifyServerOfRestore(): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    const baseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
    await fetch(`${baseUrl}/functions/v1/confirm-subscription`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        Apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
  } catch (err: any) {
    logger.warn('[useSubscription] notifyServerOfRestore failed:', err?.message);
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
      logger.log('[useSubscription] effective subscription:', JSON.stringify({
        isPremium: effective?.isPremium,
        isOnTrial: effective?.isOnTrial,
        source: effective?.source,
        plan: effective?.plan,
      }));

      if (effective?.isPremium) {
        const onTrial = effective.isOnTrial === true;
        setIsPremium(true);
        setIsOnTrial(onTrial);
        setPremiumSource(effective.source);
        setRenewalDate(formatDate(onTrial ? effective.trialExpiresAt ?? effective.expiresAt : effective.expiresAt));
        setPlan(serverPlanToDisplayPlan(effective.plan ?? ''));
        setStatus(onTrial ? 'Trial' : 'Active');
        return;
      }

      // Secondary: RevenueCat local entitlement check (native only, own subscription)
      if (Platform.OS !== 'web') {
        try {
          const { data: { session: fallbackSession } } = await supabase.auth.getSession();
          const fallbackUserId = fallbackSession?.user?.id;
          const Purchases = fallbackUserId
            ? await ensureRevenueCatUser(fallbackUserId)
            : await ensureConfigured();
          if (Purchases) {
            const info = await Purchases.getCustomerInfo();
            const entitlement = info.entitlements.active['premium'];
            logger.log('[useSubscription] RC local entitlement active:', !!entitlement,
              'productId:', entitlement?.productIdentifier ?? 'none');
            if (entitlement) {
              const onTrial = entitlement.periodType === 'TRIAL';
              setIsOnTrial(onTrial);
              setStatus(onTrial ? 'Trial' : 'Active');
              const derivedPlan = planFromProductId(entitlement.productIdentifier);
              setPlan(derivedPlan === 'yearly' ? 'Annual' : 'Monthly');
              setRenewalDate(formatDate(entitlement.expirationDate));
              setIsPremium(true);
              setPremiumSource('self');
              return;
            }
          }
        } catch (err: any) {
          logger.warn('[useSubscription] RC getCustomerInfo failed:', err?.message);
        }
      }

      // No active subscription from either source
      logger.log('[useSubscription] no active premium from any source');
      setPlan('Free');
      setStatus('Inactive');
      setIsOnTrial(false);
      setIsPremium(false);
      setPremiumSource('none');
      setRenewalDate(null);
    } catch (err: any) {
      logger.warn('[useSubscription] fetchCustomerInfo error:', err?.message);
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

  // Re-fetch when auth state changes (sign in, sign out, user switch, token refresh).
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
        void fetchCustomerInfo();
      }
    });
    return () => subscription.unsubscribe();
  }, [fetchCustomerInfo]);

  // Register RevenueCat customer info listener for mid-session subscription changes
  // (renewals, cancellations, billing issues). Native only.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    let listener: any = null;
    let active = true;
    (async () => {
      try {
        const { data: { session: listenerSession } } = await supabase.auth.getSession();
        const listenerUserId = listenerSession?.user?.id;
        const Purchases = listenerUserId
          ? await ensureRevenueCatUser(listenerUserId)
          : await ensureConfigured();
        if (!Purchases || !active) return;
        listener = Purchases.addCustomerInfoUpdateListener((info: any) => {
          const entitlement = info?.entitlements?.active?.['premium'];
          if (entitlement) {
            const onTrial = entitlement.periodType === 'TRIAL';
            setIsOnTrial(onTrial);
            setStatus(onTrial ? 'Trial' : 'Active');
            setPlan(planFromProductId(entitlement.productIdentifier) === 'yearly' ? 'Annual' : 'Monthly');
            setRenewalDate(formatDate(entitlement.expirationDate));
            setIsPremium(true);
            setPremiumSource('self');
          } else {
            // Entitlement lost — re-fetch from server to pick up partner sharing or trial.
            void fetchCustomerInfo();
          }
        });
      } catch (err: any) {
        logger.warn('[useSubscription] RC listener setup failed:', err?.message);
      }
    })();
    return () => {
      active = false;
      if (listener) {
        try { listener.remove(); } catch {}
      }
    };
  }, [fetchCustomerInfo]);

  const restorePurchases = useCallback(async () => {
    if (Platform.OS === 'web') {
      Alert.alert('Not Available', 'Purchase restoration is only available in the iOS and Android apps.');
      return;
    }
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      const Purchases = userId
        ? await ensureRevenueCatUser(userId)
        : await ensureConfigured();
      if (!Purchases) {
        Alert.alert('Unavailable', 'Purchases are not available on this device.');
        return;
      }
      const info = await Purchases.restorePurchases();
      const entitlement = info.entitlements.active['premium'];
      logger.log('[useSubscription] restore result — premium active:', !!entitlement,
        'productId:', entitlement?.productIdentifier ?? 'none');
      if (entitlement) {
        // Notify server to re-verify via RevenueCat REST API and sync Supabase.
        await notifyServerOfRestore();
        await fetchCustomerInfo();
        Alert.alert('Purchases Restored', 'Your subscription has been restored.');
      } else {
        Alert.alert('No Purchases Found', 'No active subscription was found for your account.');
      }
    } catch (e: any) {
      Alert.alert('Restore Failed', e?.message ?? 'Could not restore purchases. Please try again.');
    }
  }, [fetchCustomerInfo]);

  const openManageSubscription = useCallback(async () => {
    const url = Platform.OS === 'android'
      ? 'https://play.google.com/store/account/subscriptions'
      : 'https://apps.apple.com/account/subscriptions';
    await Linking.openURL(url);
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
