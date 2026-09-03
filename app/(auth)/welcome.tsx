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
  const isLandscape = width > height;
  const logoSize = Math.min(Math.round(width * 0.38), isTabletOrLarger ? 160 : 180);
  const wordmarkSize = Math.round(logoSize * 0.16);
  const contentWidth = isTabletOrLarger ? Math.min(width - Spacing.xl * 2, 600) : width;
  const taglineWidth = Math.min(contentWidth - Spacing.md * 2, isLandscape ? 360 : 440);
  const taglineHeight = taglineWidth * (148 / 340);
  const paddingTop = isTabletOrLarger
    ? Math.max(24, Math.round(height * 0.06)) + insets.top
    : Math.max(40, Math.round(height * 0.1)) + insets.top;
  const paddingBottom = isTabletOrLarger
    ? Math.max(20, Math.round(height * 0.04)) + insets.bottom
    : Math.max(28, Math.round(height * 0.07)) + insets.bottom;

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['#000000', '#0A0A0A', '#0D0D0D']}
        style={StyleSheet.absoluteFill}
      />

      <View style={[
        styles.container,
        { paddingTop, paddingBottom },
        isTabletOrLarger && { alignSelf: 'center', width: '100%', maxWidth: 600 },
      ]}>
        {/* Hero: logo + wordmark + tagline */}
        <View style={styles.hero}>
          <TouchableOpacity
            activeOpacity={1}
            style={{ alignItems: 'center' }}
          >
            <WarmupLogo size={logoSize} />
            <WarmupWordmark size={wordmarkSize} style={styles.wordmark} />
          </TouchableOpacity>
          <Image
            source={TAGLINE_SOURCE}
            style={{ width: taglineWidth, height: taglineHeight, marginTop: isTabletOrLarger ? 12 : 20, alignSelf: 'center' }}
            resizeMode="contain"
          />
        </View>

        <View style={styles.spacer} />

        {/* Bottom: subtitle + CTAs */}
        <View style={styles.actions}>
          <AppText style={styles.subtitle}>A private app for playful couples.</AppText>
          <AppText style={styles.trialBadge}>7-day free trial with signup</AppText>

          <TouchableOpacity
            style={styles.primaryBtn}
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

          <View style={styles.linkRow}>
            <AppText style={styles.linkText}>Already have a code? </AppText>
            <TouchableOpacity onPress={() => router.push(codeToPreserve
              ? { pathname: '/(auth)/pair', params: { prefilledCode: codeToPreserve } }
              : '/(auth)/pair'
            )} activeOpacity={0.7}>
              <AppText style={styles.linkAccent}>Enter</AppText>
            </TouchableOpacity>
          </View>

          <View style={styles.linkRow}>
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
            style={styles.previewLink}
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
    paddingHorizontal: Spacing.xl,
  },
  hero: {
    alignItems: 'center',
    alignSelf: 'center',
  },
  wordmark: {
    marginTop: 8,
  },
  spacer: {
    flex: 1,
  },
  actions: {
    width: '100%',
    alignItems: 'center',
    gap: 14,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.50)',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 2,
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
    color: 'rgba(255,255,255,0.32)',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
  },
  linkAccent: {
    color: '#FF7A45',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-SemiBold',
  },
  previewLink: {
    marginTop: 4,
    paddingVertical: 4,
  },
  previewLinkText: {
    color: 'rgba(255,255,255,0.28)',
    fontSize: FontSize.xs,
    fontFamily: 'Inter-Regular',
    letterSpacing: 0.2,
  },
  trialBadge: {
    color: '#FF7A45',
    fontSize: FontSize.xs,
    fontFamily: 'Inter-SemiBold',
    letterSpacing: 0.3,
    marginTop: 2,
  },
});
