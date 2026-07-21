import React, { useRef, useEffect } from 'react';
import {
  View, StyleSheet, TouchableOpacity, Animated,
} from 'react-native';
import { Heart, ChevronRight, Dice6, Flame } from 'lucide-react-native';
import AppText from '@/components/AppText';
import Avatar from '@/components/Avatar';
import { Spacing, Radius, FontSize } from '@/constants/theme';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';

export function ConnectedPartnerCard({
  userProfile,
  partnerProfile: partner,
  streak,
  diceRolls,
  momentsToday,
  streaksEnabled,
  onManagePairing,
}: {
  userProfile: { display_name?: string; avatar_url?: string | null } | null;
  partnerProfile: { display_name?: string; avatar_url?: string | null } | null;
  streak: number | string;
  diceRolls: number;
  momentsToday: number;
  streaksEnabled: boolean;
  onManagePairing: () => void;
}) {
  const router = useRouter();
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.13, duration: 4000, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 4000, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <View style={pcc.outerWrap}>
      {/* Gradient border frame */}
      <LinearGradient
        colors={['#FFB347', '#FF5A3D', '#FF2E8A', '#FF5A3D', '#FFB347']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={pcc.gradBorder}
      >
        <View style={pcc.inner}>
          {/* Subtle background glow */}
          <LinearGradient
            colors={['rgba(255,46,138,0.08)', 'rgba(255,90,61,0.04)', 'transparent']}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />

          {/* Avatar row */}
          <View style={pcc.avatarRow}>
            {/* User avatar */}
            <Avatar
              name={userProfile?.display_name}
              uri={userProfile?.avatar_url}
              size="lg"
            />

            {/* Heart + wave lines */}
            <View style={pcc.heartZone}>
              <LinearGradient
                colors={['transparent', 'rgba(255,46,138,0.45)', 'transparent']}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={pcc.waveLine}
              />
              <Animated.View style={[pcc.heartWrap, { transform: [{ scale: pulseAnim }] }]}>
                <LinearGradient
                  colors={['rgba(255,90,61,0.28)', 'rgba(255,46,138,0.28)']}
                  style={pcc.heartGlowBg}
                />
                <Heart color="#FF2E8A" size={38} strokeWidth={0} fill="#FF3D6A" />
              </Animated.View>
              <LinearGradient
                colors={['transparent', 'rgba(255,46,138,0.45)', 'transparent']}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={pcc.waveLine}
              />
            </View>

            {/* Partner avatar */}
            <Avatar
              name={partner?.display_name}
              uri={partner?.avatar_url}
              size="lg"
            />
          </View>

          {/* Text block */}
          <View style={pcc.textBlock}>
            <AppText style={pcc.connectedWithLabel}>CONNECTED WITH</AppText>
            <AppText style={pcc.partnerName}>{partner?.display_name ?? 'Partner'}</AppText>
            <AppText style={pcc.tagline}>Your private space together.</AppText>
          </View>

          {/* Status + CTA row */}
          <View style={pcc.statusRow}>
            <View style={pcc.connectedPill}>
              <View style={pcc.greenDot} />
              <AppText style={pcc.connectedPillText}>Connected</AppText>
            </View>
            <TouchableOpacity onPress={onManagePairing} activeOpacity={0.7} style={pcc.manageCta}>
              <AppText style={pcc.manageCtaText}>Manage Pairing</AppText>
              <ChevronRight color="#FF2E8A" size={14} strokeWidth={2.5} />
            </TouchableOpacity>
          </View>
        </View>
      </LinearGradient>

      {/* Metrics row below the card */}
      <TouchableOpacity onPress={() => router.push('/(app)/my-stats')} activeOpacity={0.75} style={pcc.metricsCard}>
        <View style={pcc.metricCol}>
          <Heart color="#FF2E8A" size={22} strokeWidth={0} fill="#FF2E8A" />
          <AppText style={pcc.metricValue}>{momentsToday.toLocaleString()}</AppText>
          <AppText style={pcc.metricLabel}>{'Moments\nTogether'}</AppText>
        </View>
        <View style={pcc.metricDivider} />
        <View style={pcc.metricCol}>
          <LinearGradient colors={['#FFB347', '#FF5A3D']} style={pcc.diceIconGrad}>
            <Dice6 color="#fff" size={14} strokeWidth={2} />
          </LinearGradient>
          <AppText style={pcc.metricValue}>{diceRolls.toLocaleString()}</AppText>
          <AppText style={pcc.metricLabel}>{'Dice\nRolls'}</AppText>
        </View>
        <View style={pcc.metricDivider} />
        <View style={pcc.metricCol}>
          <LinearGradient colors={['#FF5A3D', '#FF2E8A']} style={pcc.diceIconGrad}>
            <Flame color="#fff" size={14} strokeWidth={2} />
          </LinearGradient>
          <AppText style={pcc.metricValue}>{streaksEnabled ? streak.toLocaleString() : '—'}</AppText>
          <AppText style={pcc.metricLabel}>{'Day\nStreak'}</AppText>
        </View>
      </TouchableOpacity>
    </View>
  );
}

const pcc = StyleSheet.create({
  outerWrap: { marginBottom: Spacing.md, gap: 8 },
  gradBorder: { borderRadius: Radius.xl + 2, padding: 1.5 },
  inner: {
    borderRadius: Radius.xl,
    backgroundColor: 'rgba(18,12,26,0.97)',
    padding: Spacing.card,
    gap: 14,
    overflow: 'hidden',
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heartZone: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  waveLine: { flex: 1, height: 2, borderRadius: 1 },
  heartWrap: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heartGlowBg: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 32,
  } as any,
  textBlock: { alignItems: 'center', gap: 4 },
  connectedWithLabel: {
    fontSize: 11,
    fontFamily: 'Inter-SemiBold',
    letterSpacing: 1.4,
    color: '#FF5A3D',
  },
  partnerName: {
    fontSize: 32,
    fontFamily: 'Inter-Bold',
    color: '#FFFFFF',
    lineHeight: 38,
  },
  tagline: {
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
    color: 'rgba(255,255,255,0.50)',
    marginTop: 2,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  connectedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(51,209,122,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(51,209,122,0.28)',
    borderRadius: Radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  greenDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#33D17A' },
  connectedPillText: {
    fontSize: FontSize.sm,
    fontFamily: 'Inter-SemiBold',
    color: '#33D17A',
  },
  manageCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingVertical: 4,
  },
  manageCtaText: {
    fontSize: FontSize.sm,
    fontFamily: 'Inter-SemiBold',
    color: '#FF2E8A',
  },
  // Metrics card
  metricsCard: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.055)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: Radius.lg,
    paddingVertical: Spacing.md,
  },
  metricCol: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  metricDivider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: 'rgba(255,255,255,0.09)',
    marginVertical: 4,
  },
  metricValue: {
    fontSize: FontSize.h2,
    fontFamily: 'Inter-Bold',
    color: '#FFFFFF',
    lineHeight: 28,
  },
  metricLabel: {
    fontSize: 10,
    fontFamily: 'Inter-Medium',
    color: 'rgba(255,255,255,0.44)',
    textAlign: 'center',
    lineHeight: 14,
  },
  diceIconGrad: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
