import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Platform,
  ActivityIndicator,
} from 'react-native';
import AppText from '@/components/AppText';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Flame, Gift, Lock, MessageCircle, Star, Zap, CircleAlert as AlertCircle, Heart } from 'lucide-react-native';
import WarmupBrand from '@/components/WarmupBrand';
import { FontSize, Spacing, Radius } from '@/constants/theme';
import { useLayout } from '@/hooks/useLayout';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';

type Plan = 'monthly' | 'yearly';
type Reason = 'expired_trial' | 'post_unpairing' | undefined;

const PLANS: {
  id: Plan;
  label: string;
  price: string;
  period: string;
  badge?: string;
  sub: string;
}[] = [
  {
    id: 'monthly',
    label: 'Monthly',
    price: '$9.99',
    period: 'per month',
    sub: 'Billed monthly, cancel anytime',
  },
  {
    id: 'yearly',
    label: 'Yearly',
    price: '$99.99',
    period: 'per year',
    badge: 'Best Value',
    sub: 'Save 17% — just $8.33/mo',
  },
];

const FEATURES = [
  { Icon: Zap, text: 'Unlimited Dares & Dice rolls' },
  { Icon: MessageCircle, text: 'Private couples chat' },
  { Icon: Lock, text: 'Shared Vault for photos & videos' },
  { Icon: Flame, text: 'Streaks & daily challenges' },
  { Icon: Star, text: 'Points, rewards & milestones' },
  { Icon: Gift, text: 'Custom prompts for your vibe' },
];

export default function SubscriptionScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height, isTablet, contentMaxWidth } = useLayout();
  const { reason: reasonParam } = useLocalSearchParams<{ reason?: string }>();
  const reason = reasonParam as Reason;
  const { refreshSubscription } = useAuth();

  const [selected, setSelected] = useState<Plan>('yearly');
  const [loading, setLoading] = useState(false);
  const [packages, setPackages] = useState<Record<string, any>>({});
  const [offeringsLoaded, setOfferingsLoaded] = useState(false);

  const logoSize = Math.min(Math.round(width * 0.12), 48);

  // Load RevenueCat offerings on mount (native only)
  useEffect(() => {
    if (Platform.OS === 'web') {
      setOfferingsLoaded(true);
      return;
    }
    (async () => {
      try {
        const Purchases = (await import('react-native-purchases')).default;
        const iosKey = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY;
        const androidKey = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;
        const apiKey = Platform.OS === 'ios' ? iosKey : androidKey;
        if (!apiKey) { setOfferingsLoaded(true); return; }
        Purchases.configure({ apiKey });
        const offerings = await Purchases.getOfferings();
        const current = offerings.current;
        if (current) {
          const pkgMap: Record<string, any> = {};
          for (const pkg of current.availablePackages) {
            const id = pkg.product.identifier.toLowerCase();
            if (id.includes('annual') || id.includes('yearly') || id.includes('year')) {
              pkgMap['yearly'] = pkg;
            } else if (id.includes('monthly') || id.includes('month')) {
              pkgMap['monthly'] = pkg;
            }
          }
          setPackages(pkgMap);
        }
      } catch {
        // Offerings unavailable — will show store prices from PLANS constants
      } finally {
        setOfferingsLoaded(true);
      }
    })();
  }, []);

  const confirmWithServer = async (entitlements: any, planFallback: Plan, expiresAtFallback: string | null) => {
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
      body: JSON.stringify({ entitlements, plan: planFallback, expiresAt: expiresAtFallback }),
    });
  };

  const handleSubscribe = async () => {
    if (loading) return;

    if (__DEV__) {
      setLoading(true);
      try {
        const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
        await confirmWithServer({ active: {} }, selected, expiresAt);
        await refreshSubscription();
        router.replace('/(app)/(tabs)');
      } catch {
        router.replace('/(app)/(tabs)');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (Platform.OS === 'web') {
      Alert.alert('Mobile Only', 'Subscriptions are available in the iOS and Android apps.');
      return;
    }

    setLoading(true);
    try {
      const Purchases = (await import('react-native-purchases')).default;
      const pkg = packages[selected];
      if (!pkg) {
        Alert.alert('Unavailable', 'This plan is currently unavailable. Please try again later.');
        return;
      }
      const { customerInfo } = await Purchases.purchasePackage(pkg);
      await confirmWithServer(customerInfo.entitlements, selected, null);
      await refreshSubscription();
      router.replace('/(app)/(tabs)');
    } catch (e: any) {
      if (e?.code === '1') return; // user cancelled
      Alert.alert('Purchase Failed', e?.message ?? 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async () => {
    if (Platform.OS === 'web') {
      Alert.alert('Not Available', 'Purchase restoration is only available on iOS and Android.');
      return;
    }
    setLoading(true);
    try {
      const Purchases = (await import('react-native-purchases')).default;
      const info = await Purchases.restorePurchases();
      const entitlement = info.entitlements.active['premium'];
      if (entitlement) {
        await confirmWithServer(info.entitlements, selected, entitlement.expirationDate ?? null);
        await refreshSubscription();
        router.replace('/(app)/(tabs)');
      } else {
        Alert.alert('No Purchases Found', 'No active subscription found for your account.');
      }
    } catch (e: any) {
      Alert.alert('Restore Failed', e?.message ?? 'Could not restore purchases. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const selectedPlan = PLANS.find((p) => p.id === selected)!;

  const centerStyle = isTablet
    ? { maxWidth: contentMaxWidth, alignSelf: 'center' as const, width: '100%' as const }
    : {};

  const reasonBanner =
    reason === 'post_unpairing'
      ? { Icon: Heart, text: "Your partner's subscription no longer covers you. Subscribe to continue." }
      : reason === 'expired_trial'
      ? { Icon: AlertCircle, text: 'Your 7-day free trial has ended. Subscribe to keep access.' }
      : null;

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['#060408', '#0C0608', '#060408']}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.glowTop, { width: width * 0.9, height: width * 0.6 }]} />

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 32 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={centerStyle}>
          <View style={styles.brandRow}>
            <WarmupBrand logoSize={logoSize} showTagline={false} />
          </View>

          {reasonBanner && (
            <View style={styles.reasonBanner}>
              <reasonBanner.Icon color="#FF9A3D" size={18} strokeWidth={2} />
              <AppText style={styles.reasonBannerText}>{reasonBanner.text}</AppText>
            </View>
          )}

          <AppText style={styles.heading}>Unlock everything</AppText>
          <AppText style={styles.sub}>
            One subscription covers both of you. Your partner joins free.
          </AppText>

          <View style={[styles.featureList, { marginBottom: height < 700 ? 20 : 28 }]}>
            {FEATURES.map(({ Icon, text }) => (
              <View key={text} style={styles.featureRow}>
                <View style={styles.featureIcon}>
                  <Icon color="#FF5A3D" size={15} strokeWidth={2} />
                </View>
                <AppText style={styles.featureText}>{text}</AppText>
              </View>
            ))}
          </View>

          <View style={styles.planList}>
            {PLANS.map((plan) => {
              const active = selected === plan.id;
              return (
                <TouchableOpacity
                  key={plan.id}
                  style={[styles.planCard, active && styles.planCardActive]}
                  onPress={() => setSelected(plan.id)}
                  activeOpacity={0.8}
                >
                  {plan.badge && (
                    <View style={styles.planBadge}>
                      <LinearGradient
                        colors={['#FF7B00', '#FF2E8A']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.planBadgeGrad}
                      >
                        <AppText style={styles.planBadgeText}>{plan.badge}</AppText>
                      </LinearGradient>
                    </View>
                  )}

                  <View style={styles.planLeft}>
                    <View style={[styles.radio, active && styles.radioActive]}>
                      {active && <View style={styles.radioDot} />}
                    </View>
                    <View>
                      <AppText style={[styles.planLabel, active && styles.planLabelActive]}>
                        {plan.label}
                      </AppText>
                      <AppText style={styles.planSub}>{plan.sub}</AppText>
                    </View>
                  </View>

                  <View style={styles.planRight}>
                    <AppText style={[styles.planPrice, active && styles.planPriceActive]}>
                      {plan.price}
                    </AppText>
                    <AppText style={styles.planPeriod}>{plan.period}</AppText>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity
            style={styles.ctaBtn}
            onPress={handleSubscribe}
            activeOpacity={0.85}
            disabled={loading || (!offeringsLoaded && Platform.OS !== 'web')}
          >
            <LinearGradient
              colors={['#FF7B00', '#FF5A3D', '#FF2E8A']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.ctaGrad}
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <AppText style={styles.ctaLabel}>
                  {`Subscribe — ${selectedPlan.price}/${selected === 'monthly' ? 'mo' : 'yr'}`}
                </AppText>
              )}
            </LinearGradient>
          </TouchableOpacity>

          <AppText style={styles.legal}>
            Subscription auto-renews. Cancel anytime in your account settings.
          </AppText>

          <AppText style={styles.partnerNote}>
            Subscribe to invite your partner. They join at no extra cost.
          </AppText>

          <TouchableOpacity onPress={handleRestore} activeOpacity={0.7} style={styles.restoreBtn} disabled={loading}>
            <AppText style={styles.restoreText}>Restore Purchase</AppText>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#060408',
  },
  glowTop: {
    position: 'absolute',
    top: -200,
    alignSelf: 'center',
    borderRadius: 9999,
    backgroundColor: 'rgba(255,60,80,0.06)',
  },
  scroll: {
    paddingHorizontal: Spacing.xl,
    alignItems: 'center',
  },
  brandRow: {
    marginBottom: 24,
    alignItems: 'center',
  },
  reasonBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: 'rgba(255,154,61,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,154,61,0.25)',
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    marginBottom: 20,
    width: '100%',
  },
  reasonBannerText: {
    color: 'rgba(255,220,180,0.90)',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
    lineHeight: 20,
    flex: 1,
  },
  heading: {
    color: '#fff',
    fontSize: FontSize.h1,
    fontFamily: 'Inter-Bold',
    letterSpacing: -0.5,
    textAlign: 'center',
    marginBottom: 10,
  },
  sub: {
    color: 'rgba(255,255,255,0.50)',
    fontSize: FontSize.body,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 28,
  },
  featureList: {
    width: '100%',
    gap: 10,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  featureIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: 'rgba(255,90,61,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,90,61,0.20)',
    flexShrink: 0,
  },
  featureText: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
    flex: 1,
  },
  planList: {
    width: '100%',
    gap: 10,
    marginBottom: 24,
  },
  planCard: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.09)',
    padding: Spacing.md,
    position: 'relative',
    overflow: 'hidden',
  },
  planCardActive: {
    borderColor: 'rgba(255,90,61,0.55)',
    backgroundColor: 'rgba(255,90,61,0.07)',
  },
  planBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    borderBottomLeftRadius: Radius.sm,
    overflow: 'hidden',
  },
  planBadgeGrad: {
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  planBadgeText: {
    color: '#fff',
    fontSize: FontSize.xs,
    fontFamily: 'Inter-Bold',
    letterSpacing: 0.3,
  },
  planLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  radioActive: {
    borderColor: '#FF5A3D',
  },
  radioDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: '#FF5A3D',
  },
  planLabel: {
    color: 'rgba(255,255,255,0.70)',
    fontSize: FontSize.body,
    fontFamily: 'Inter-SemiBold',
    marginBottom: 2,
  },
  planLabelActive: {
    color: '#fff',
  },
  planSub: {
    color: 'rgba(255,255,255,0.38)',
    fontSize: FontSize.xs,
    fontFamily: 'Inter-Regular',
  },
  planRight: {
    alignItems: 'flex-end',
    flexShrink: 0,
    marginLeft: 8,
  },
  planPrice: {
    color: 'rgba(255,255,255,0.60)',
    fontSize: FontSize.lg,
    fontFamily: 'Inter-Bold',
  },
  planPriceActive: {
    color: '#fff',
  },
  planPeriod: {
    color: 'rgba(255,255,255,0.36)',
    fontSize: FontSize.xs,
    fontFamily: 'Inter-Regular',
  },
  ctaBtn: {
    width: '88%',
    borderRadius: Radius.pill,
    overflow: 'hidden',
    shadowColor: '#FF5A3D',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 20,
    elevation: 12,
    marginBottom: 14,
    alignSelf: 'center',
  },
  ctaGrad: {
    paddingVertical: 17,
    alignItems: 'center',
    borderRadius: Radius.pill,
    minHeight: 54,
    justifyContent: 'center',
  },
  ctaLabel: {
    color: '#fff',
    fontSize: FontSize.lg,
    fontFamily: 'Inter-Bold',
    letterSpacing: 0.2,
  },
  legal: {
    color: 'rgba(255,255,255,0.28)',
    fontSize: FontSize.xs,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 8,
    paddingHorizontal: Spacing.md,
  },
  partnerNote: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: FontSize.xs,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
    paddingHorizontal: Spacing.md,
  },
  restoreBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignSelf: 'center',
  },
  restoreText: {
    color: 'rgba(255,255,255,0.40)',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
    textDecorationLine: 'underline',
  },
});
