import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import AppText from '@/components/AppText';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, Flame, Gift, Heart, Lock, MessageCircle, Star, Zap } from 'lucide-react-native';
import WarmupBrand from '@/components/WarmupBrand';
import { FontSize, Spacing, Radius } from '@/constants/theme';
import { useLayout } from '@/hooks/useLayout';

type Plan = 'trial' | 'monthly' | 'yearly';

const PLANS: {
  id: Plan;
  label: string;
  price: string;
  period: string;
  badge?: string;
  sub: string;
}[] = [
  {
    id: 'trial',
    label: 'Free Trial',
    price: '$0',
    period: '7 days',
    sub: 'Full access, no credit card required',
  },
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
    price: '$59.99',
    period: 'per year',
    badge: 'Best Value',
    sub: 'Save 50% — just $5/mo',
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
  const [selected, setSelected] = useState<Plan>('yearly');
  const [loading, setLoading] = useState(false);

  const logoSize = Math.min(Math.round(width * 0.12), 48);

  const handleSubscribe = async () => {
    if (loading) return;
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      router.replace('/(app)/(tabs)');
    }, 800);
  };

  const handleRestore = () => {
    // TODO: RevenueCat restorePurchases()
  };

  const selectedPlan = PLANS.find((p) => p.id === selected)!;

  const centerStyle = isTablet
    ? { maxWidth: contentMaxWidth, alignSelf: 'center' as const, width: '100%' as const }
    : {};

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

          <AppText style={styles.heading}>Unlock everything</AppText>
          <AppText style={styles.sub}>
            One subscription covers you both. Your partner joins free.
          </AppText>

          {/* Feature list */}
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

          {/* Plan cards */}
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

          {/* CTA */}
          <TouchableOpacity
            style={styles.ctaBtn}
            onPress={handleSubscribe}
            activeOpacity={0.85}
            disabled={loading}
          >
            <LinearGradient
              colors={['#FF7B00', '#FF5A3D', '#FF2E8A']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.ctaGrad}
            >
              <AppText style={styles.ctaLabel}>
                {loading
                  ? 'Starting…'
                  : selected === 'trial'
                  ? 'Start Free Trial'
                  : `Subscribe — ${selectedPlan.price}/${selected === 'monthly' ? 'mo' : 'yr'}`}
              </AppText>
            </LinearGradient>
          </TouchableOpacity>

          <AppText style={styles.legal}>
            {selected === 'trial'
              ? 'No credit card required. Cancel before 7 days to avoid charges.'
              : 'Subscription auto-renews. Cancel anytime in your account settings.'}
          </AppText>

          <TouchableOpacity onPress={handleRestore} activeOpacity={0.7} style={styles.restoreBtn}>
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
});
