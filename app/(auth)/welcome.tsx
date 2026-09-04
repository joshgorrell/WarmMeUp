import React, { useEffect } from 'react';
import { View, StyleSheet, Image, TouchableOpacity } from 'react-native';
import AppText from '@/components/AppText';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontSize, Spacing, Radius } from '@/constants/theme';
import WarmupLogo from '@/components/WarmupLogo';
import WarmupWordmark from '@/components/WarmupWordmark';
import { useLayout } from '@/hooks/useLayout';

const TAGLINE_SOURCE = require('@/assets/images/image_(2).png');

export default function WelcomeScreen() {
  const router = useRouter();
  const { pendingCode, prefilledCode, code } = useLocalSearchParams<{ pendingCode?: string; prefilledCode?: string; code?: string }>();
  const codeToPreserve = (pendingCode || prefilledCode || code || '').toUpperCase().trim();
  const insets = useSafeAreaInsets();

  // If a code arrived via deep-link params, forward immediately to pair screen.
  useEffect(() => {
    if (codeToPreserve) {
      router.replace({ pathname: '/(auth)/pair', params: { prefilledCode: codeToPreserve } });
    }
  }, [codeToPreserve]);

  const { width, height, isTabletOrLarger } = useLayout();
  const isShortScreen = height < 700;

  // Reduce W icon ~22%: from 0.38*width / cap 180 to 0.30*width / cap 140
  const logoSize = Math.min(Math.round(width * 0.30), isTabletOrLarger ? 128 : 140);
  const wordmarkSize = Math.round(logoSize * 0.16);
  const contentWidth = isTabletOrLarger ? Math.min(width - Spacing.xl * 2, 600) : width;
  const taglineWidth = Math.min(contentWidth - Spacing.md * 2, isTabletOrLarger ? 320 : 400);
  const taglineHeight = taglineWidth * (148 / 340);

  // Responsive vertical spacing between brand group and subtitle
  const brandGap = isShortScreen
    ? Math.max(16, Math.round(height * 0.025))
    : Math.max(24, Math.min(48, Math.round(height * 0.04)));

  // Inter-element gaps tighten on short screens
  const trialGap = isShortScreen ? 5 : 7;
  const linkGap = isShortScreen ? 7 : 10;
  const linkRowGap = isShortScreen ? 6 : 8;
  const previewGap = isShortScreen ? 10 : 14;

  const safePadTop = insets.top + 8;
  const safePadBottom = insets.bottom + 8;

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['#000000', '#0A0A0A', '#0D0D0D']}
        style={StyleSheet.absoluteFill}
      />

      <View style={[
        styles.container,
        {
          paddingTop: safePadTop,
          paddingBottom: safePadBottom,
        },
        isTabletOrLarger && { alignSelf: 'center', width: '100%', maxWidth: 600 },
      ]}>
        {/* Brand group: W icon + wordmark + Stay Playful tagline */}
        <View style={styles.brandGroup}>
          <TouchableOpacity
            activeOpacity={1}
            style={styles.logoWordmark}
          >
            <WarmupLogo size={logoSize} />
            <WarmupWordmark size={wordmarkSize} style={styles.wordmark} />
          </TouchableOpacity>
          <Image
            source={TAGLINE_SOURCE}
            style={{
              width: taglineWidth,
              height: taglineHeight,
              marginTop: 6,
              alignSelf: 'center',
            }}
            resizeMode="contain"
          />
        </View>

        {/* Value proposition + trial + CTAs */}
        <View style={[styles.actions, { marginTop: brandGap }]}>
          <AppText style={styles.subtitle}>A private app for playful couples.</AppText>

          <View style={[styles.trialRow, { marginTop: trialGap }]}>
            <AppText style={styles.trialPrefix}>Start your </AppText>
            <AppText style={styles.trialHighlight}>7-day free trial</AppText>
          </View>

          <TouchableOpacity
            style={[styles.primaryBtn, { marginTop: isShortScreen ? 14 : 18 }]}
            onPress={() => router.push(codeToPreserve
              ? { pathname: '/(auth)/register', params: { pendingCode: codeToPreserve } }
              : '/(auth)/register'
            )}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={['#FFB347', '#FF5A3D', '#FF2E8A']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.primaryGrad}
            >
              <AppText style={styles.primaryLabel}>Get Started</AppText>
            </LinearGradient>
          </TouchableOpacity>

          <View style={[styles.linkRow, { marginTop: linkGap }]}>
            <AppText style={styles.linkText}>Already have a code? </AppText>
            <TouchableOpacity onPress={() => router.push(codeToPreserve
              ? { pathname: '/(auth)/pair', params: { prefilledCode: codeToPreserve } }
              : '/(auth)/pair'
            )} activeOpacity={0.7}>
              <AppText style={styles.linkAccent}>Enter</AppText>
            </TouchableOpacity>
          </View>

          <View style={[styles.linkRow, { marginTop: linkRowGap }]}>
            <AppText style={styles.linkText}>Already have an account? </AppText>
            <TouchableOpacity onPress={() => router.push(codeToPreserve
              ? { pathname: '/(auth)/login', params: { pendingCode: codeToPreserve } }
              : '/(auth)/login'
            )} activeOpacity={0.7}>
              <AppText style={styles.linkAccent}>Sign In</AppText>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            onPress={() => router.push('/(auth)/onboarding-preview')}
            activeOpacity={0.7}
            style={[styles.previewLink, { marginTop: previewGap }]}
          >
            <AppText style={styles.previewLinkText}>See how it works →</AppText>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000000',
  },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
  },
  brandGroup: {
    alignItems: 'center',
    alignSelf: 'center',
  },
  logoWordmark: {
    alignItems: 'center',
  },
  wordmark: {
    marginTop: 4,
  },
  actions: {
    width: '100%',
    alignItems: 'center',
  },
  subtitle: {
    color: 'rgba(255,255,255,0.68)',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    lineHeight: 22,
  },
  trialRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  trialPrefix: {
    color: 'rgba(255,255,255,0.68)',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
  },
  trialHighlight: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-SemiBold',
  },
  primaryBtn: {
    width: '88%',
    borderRadius: Radius.pill,
    overflow: 'hidden',
    shadowColor: '#FF5A3D',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 12,
  },
  primaryGrad: {
    paddingVertical: 15,
    alignItems: 'center',
    borderRadius: Radius.pill,
  },
  primaryLabel: {
    color: '#fff',
    fontSize: FontSize.body,
    fontFamily: 'Inter-Bold',
    letterSpacing: 0.3,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  linkText: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
  },
  linkAccent: {
    color: '#FF7A45',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-SemiBold',
  },
  previewLink: {
    paddingVertical: 4,
  },
  previewLinkText: {
    color: 'rgba(255,255,255,0.42)',
    fontSize: FontSize.xs,
    fontFamily: 'Inter-Regular',
    letterSpacing: 0.2,
  },
});
