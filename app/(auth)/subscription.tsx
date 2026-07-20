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
import {
  Flame, Gift, Lock, MessageCircle, Star, Zap,
  CircleAlert as AlertCircle, Heart, X,
} from 'lucide-react-native';
import WarmupBrand from '@/components/WarmupBrand';
import CancellationSurveySheet from '@/components/CancellationSurveySheet';
import { FontSize, Spacing, Radius } from '@/constants/theme';
import { useLayout } from '@/hooks/useLayout';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { ensureConfigured } from '@/lib/purchases';
import { MONTHLY_PRODUCT_ID, ANNUAL_PRODUCT_ID } from '@/lib/productIds';

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
    sub: 'Billed monthly · cancel anytime',
  },
  {
    id: 'yearly',
    label: 'Yearly',
    price: '$99.99',
    period: 'per year',
    badge: 'Best Value',
    sub: 'Save 17% · just $8.33/mo',
  },
];

const FEATURES = [
  { Icon: Zap,           text: 'Unlimited Dares & Dice rolls' },
  { Icon: MessageCircle, text: 'Private couples chat' },
  { Icon: Lock,          text: 'Shared Vault for photos & videos' },
  { Icon: Flame,         text: 'Streaks & daily challenges' },
  { Icon: Star,          text: 'Points, rewards & milestones' },
  { Icon: Gift,          text: 'Custom prompts for your vibe' },
];

export default function SubscriptionScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height, isTablet, contentMaxWidth } = useLayout();
  const { reason: reasonParam } = useLocalSearchParams<{ reason?: string }>();
  const reason = reasonParam as Reason;
  const { refreshSubscription, subscriptionInfo } = useAuth();

  const [selected, setSelected] = useState<Plan>('yearly');
  const [loading, setLoading] = useState(false);
  const [packages, setPackages] = useState<Record<string, any>>({});
  const [offeringsLoaded, setOfferingsLoaded] = useState(false);
  const [showSurvey, setShowSurvey] = useState(false);
  const surveyShownRef = React.useRef(false);

  // Show cancellation survey when trial expired — once per screen mount
  useEffect(() => {
    if (reason === 'expired_trial' && !surveyShownRef.current) {
      surveyShownRef.current = true;
      const timer = setTimeout(() => setShowSurvey(true), 1200);
      return () => clearTimeout(timer);
    }
  }, [reason]);

  const logoSize = Math.min(Math.round(width * 0.12), 48);
  const canDismiss = !reason;

  // Load RevenueCat offerings on mount (native only)
  useEffect(() => {
    if (Platform.OS === 'web') {
      setOfferingsLoaded(true);
      return;
    }
    (async () => {
      try {
        const Purchases = await ensureConfigured();
        if (!Purchases) { setOfferingsLoaded(true); return; }
        const offerings = await Purchases.getOfferings();
        const current = offerings.current;
        console.log('[Subscription] offerings loaded, current:', current?.identifier ?? 'null');
        if (current) {
          const pkgMap: Record<string, any> = {};
          for (const pkg of current.availablePackages) {
            const id = pkg.product.identifier;
            console.log('[Subscription] package found:', id);
            if (id === ANNUAL_PRODUCT_ID) {
              pkgMap['yearly'] = pkg;
            } else if (id === MONTHLY_PRODUCT_ID) {
              pkgMap['monthly'] = pkg;
            }
          }
          console.log('[Subscription] mapped packages — monthly:', !!pkgMap['monthly'], 'yearly:', !!pkgMap['yearly']);
          setPackages(pkgMap);
        } else {
          console.warn('[Subscription] no current offering returned from RevenueCat');
        }
      } catch (err: any) {
        console.warn('[Subscription] getOfferings failed:', err?.message);
      } finally {
        setOfferingsLoaded(true);
      }
    })();
  }, []);

  const confirmWithServer = async (): Promise<boolean> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return false;
    const baseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
    const res = await fetch(`${baseUrl}/functions/v1/confirm-subscription`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        Apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    console.log('[Subscription] confirm-subscription response:', res.status);
    return res.ok;
  };

  const handleSubscribe = async () => {
    if (loading) return;

    if (Platform.OS === 'web') {
      Alert.alert('Mobile Only', 'Subscriptions are available in the iOS and Android apps.');
      return;
    }

    setLoading(true);
    try {
      const Purchases = await ensureConfigured();
      const pkg = Purchases ? packages[selected] : null;
      if (!pkg) {
        Alert.alert('Unavailable', 'This plan is currently unavailable. Please try again later.');
        console.warn('[Subscription] handleSubscribe — package not found for plan:', selected, 'available:', Object.keys(packages));
        return;
      }
      console.log('[Subscription] purchasing package:', pkg.product.identifier);
      const { customerInfo } = await Purchases!.purchasePackage(pkg);
      const entitlement = customerInfo.entitlements.active['premium'];
      console.log('[Subscription] purchase result — premium entitlement active:', !!entitlement);
      if (!entitlement) {
        Alert.alert('Purchase Not Confirmed', 'Your purchase completed but the premium entitlement was not found. Please tap Restore Purchase.');
        return;
      }
      const confirmed = await confirmWithServer();
      console.log('[Subscription] server confirm result:', confirmed);
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
      const Purchases = await ensureConfigured();
      if (!Purchases) {
        Alert.alert('Unavailable', 'Purchases are not available on this device.');
        setLoading(false);
        return;
      }
      const info = await Purchases.restorePurchases();
      const entitlement = info.entitlements.active['premium'];
      console.log('[Subscription] restore result — premium entitlement active:', !!entitlement);
      if (entitlement) {
        const confirmed = await confirmWithServer();
        console.log('[Subscription] server confirm after restore:', confirmed);
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

  const innerStyle = isTablet
    ? { maxWidth: contentMaxWidth, alignSelf: 'center' as const, width: '100%' as const }
    : { width: '100%' as const };

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

      {canDismiss && (
        <TouchableOpacity
          style={[styles.dismissBtn, { top: insets.top + 12 }]}
          onPress={() => router.replace('/(app)/(tabs)')}
          activeOpacity={0.7}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <X color="rgba(255,255,255,0.50)" size={20} strokeWidth={2} />
        </TouchableOpacity>
      )}

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + (canDismiss ? 52 : 24), paddingBottom: insets.bottom + 32 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={innerStyle}>
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
            One subscription covers both of you.{'\n'}Your partner joins at no extra cost.
          </AppText>

          <View style={[styles.featureList, { marginBottom: height < 700 ? 20 : 28 }]}>
            {FEATURES.map(({ Icon, text }) => (
              <View key={text} style={styles.featureRow}>
                <View style={styles.featureIcon}>
                  <Icon color="#FF5A3D" size={16} strokeWidth={2} />
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
                    <View style={styles.planLabelWrap}>
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

          <TouchableOpacity onPress={handleRestore} activeOpacity={0.7} style={styles.restoreBtn} disabled={loading}>
            <AppText style={styles.restoreText}>Restore Purchase</AppText>
          </TouchableOpacity>

          {canDismiss && (
            <TouchableOpacity
              style={styles.continueTrialBtn}
              onPress={() => router.replace('/(app)/(tabs)')}
              activeOpacity={0.7}
              disabled={loading}
            >
              <AppText style={styles.continueTrialText}>
                {subscriptionInfo.isOnTrial && subscriptionInfo.trialExpiresAt
                  ? `Continue with free trial · expires ${new Date(subscriptionInfo.trialExpiresAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
                  : 'Continue — subscribe later'}
              </AppText>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      <CancellationSurveySheet
        visible={showSurvey}
        onClose={() => setShowSurvey(false)}
        surveyType="trial_expired"
      />
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
  dismissBtn: {
    position: 'absolute',
    right: 18,
    zIndex: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
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
    marginBottom: 24,
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
    gap: 12,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    width: '100%',
  },
  featureIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: 'rgba(255,90,61,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,90,61,0.22)',
    flexShrink: 0,
  },
  featureText: {
    color: 'rgba(255,255,255,0.80)',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Medium',
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
    marginRight: 8,
  },
  planLabelWrap: {
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
    width: '100%',
    borderRadius: Radius.pill,
    overflow: 'hidden',
    shadowColor: '#FF5A3D',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 20,
    elevation: 12,
    marginBottom: 14,
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
  continueTrialBtn: {
    marginTop: 16,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignSelf: 'center',
  },
  continueTrialText: {
    color: 'rgba(255,255,255,0.36)',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
  },
});
