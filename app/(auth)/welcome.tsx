import React from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { FontSize, Spacing, Radius } from '@/constants/theme';
import WarmupLogo from '@/components/WarmupLogo';
import WarmupWordmark from '@/components/WarmupWordmark';

const TAGLINE_SOURCE = require('@/assets/images/image_(2).png');

export default function WelcomeScreen() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const logoSize = Math.min(Math.round(width * 0.38), 180);
  const wordmarkSize = Math.round(logoSize * 0.16);
  const taglineWidth = Math.min(width - Spacing.md * 2, 440);
  const taglineHeight = taglineWidth * (148 / 340);
  const paddingTop = Math.max(40, Math.round(height * 0.1));
  const paddingBottom = Math.max(28, Math.round(height * 0.07));

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['#000000', '#0A0A0A', '#0D0D0D']}
        style={StyleSheet.absoluteFill}
      />

      <View style={[styles.container, { paddingTop, paddingBottom }]}>
        {/* Hero: logo + wordmark + tagline */}
        <View style={styles.hero}>
          {/* Glow anchored behind hero content */}
          <View style={styles.glow} />
          <WarmupLogo size={logoSize} />
          <WarmupWordmark size={wordmarkSize} style={styles.wordmark} />
          <Image
            source={TAGLINE_SOURCE}
            style={{ width: taglineWidth, height: taglineHeight, marginTop: 20, alignSelf: 'center' }}
            resizeMode="contain"
          />
        </View>

        <View style={styles.spacer} />

        {/* Bottom: subtitle + CTAs */}
        <View style={styles.actions}>
          <Text style={styles.subtitle}>A private space for a playful connection.</Text>

          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => router.push('/(auth)/register')}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={['#FFB347', '#FF5A3D', '#FF2E8A']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.primaryGrad}
            >
              <Text style={styles.primaryLabel}>Get Started</Text>
            </LinearGradient>
          </TouchableOpacity>

          <View style={styles.linkRow}>
            <Text style={styles.linkText}>Already have a code? </Text>
            <TouchableOpacity onPress={() => router.push('/(auth)/pair')} activeOpacity={0.7}>
              <Text style={styles.linkAccent}>Enter</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.linkRow}>
            <Text style={styles.linkText}>Already have an account? </Text>
            <TouchableOpacity onPress={() => router.push('/(auth)/login')} activeOpacity={0.7}>
              <Text style={styles.linkAccent}>Sign In</Text>
            </TouchableOpacity>
          </View>
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
  glow: {
    position: 'absolute',
    alignSelf: 'center',
    width: 440,
    height: 440,
    borderRadius: 220,
    top: -80,
    backgroundColor: 'rgba(255, 90, 61, 0.06)',
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
});
