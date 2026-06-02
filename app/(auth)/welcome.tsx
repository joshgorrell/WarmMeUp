import React, { useEffect, useMemo } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Image,
  Dimensions,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width: SW, height: SH } = Dimensions.get('window');

// Artwork design dimensions (iPhone 14, 390 × 844 pt).
const ART_W = 390;
const ART_H = 844;

// Button positions in the artwork, expressed as fractions of ART_H / ART_W.
// At runtime we multiply by the contain-scale and add the letterbox offset.
//
//   "Get Started" pill:              y ≈ 82.2 %
//   "Already have a code? Enter":   y ≈ 87.5 %
//   "Sign In" link row:              y ≈ 91.2 %
//   "See how it works →":            y ≈ 95.0 %
//   All: left ≈ 6 %, right ≈ 6 %
const ZONES = {
  getStarted: { topFrac: 0.822, hFrac: 0.069, lFrac: 0.06, rFrac: 0.06 },
  enter:      { topFrac: 0.875, hFrac: 0.048, lFrac: 0.06, rFrac: 0.06 },
  signIn:     { topFrac: 0.912, hFrac: 0.048, lFrac: 0.06, rFrac: 0.06 },
  seeHow:     { topFrac: 0.950, hFrac: 0.043, lFrac: 0.06, rFrac: 0.06 },
} as const;

const LOGIN_BG = require('@/assets/onboarding/New_Login_page_6.2.26.png');

export default function WelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { pendingCode, prefilledCode, code } = useLocalSearchParams<{
    pendingCode?: string;
    prefilledCode?: string;
    code?: string;
  }>();
  const codeToPreserve = (pendingCode || prefilledCode || code || '').toUpperCase().trim();

  // Forward deep-link codes straight to pair screen.
  useEffect(() => {
    if (codeToPreserve) {
      router.replace({ pathname: '/(auth)/pair', params: { prefilledCode: codeToPreserve } });
    }
  }, [codeToPreserve]);

  // Compute contain-scale layout so tap zones track the visible artwork.
  const layout = useMemo(() => {
    const scale = Math.min(SW / ART_W, SH / ART_H);
    const renderedW = ART_W * scale;
    const renderedH = ART_H * scale;
    const offsetX = (SW - renderedW) / 2;
    const rawOffsetY = (SH - renderedH) / 2;
    // Never let artwork start above the status bar
    const offsetY = Math.max(rawOffsetY, insets.top);

    const toScreenY = (frac: number) => offsetY + frac * renderedH;
    const toScreenH = (frac: number) => frac * renderedH;
    const toScreenLeft  = (frac: number) => offsetX + frac * renderedW;
    const toScreenRight = (frac: number) => offsetX + frac * renderedW;

    return { toScreenY, toScreenH, toScreenLeft, toScreenRight };
  }, [insets.top]);

  const zone = (key: keyof typeof ZONES) => {
    const z = ZONES[key];
    return {
      top:    layout.toScreenY(z.topFrac),
      height: layout.toScreenH(z.hFrac),
      left:   layout.toScreenLeft(z.lFrac),
      right:  layout.toScreenRight(z.rFrac),
    };
  };

  return (
    <View style={s.root}>
      <StatusBar style="light" />

      {/* Contained artwork — no horizontal crop on any device */}
      <Image
        source={LOGIN_BG}
        style={StyleSheet.absoluteFill}
        resizeMode="contain"
        accessibilityLabel="Warm Me Up – Stay Playful"
      />

      {/* Invisible hit areas aligned to the rendered image bounds */}
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">

        <TouchableOpacity
          style={[s.zone, zone('getStarted')]}
          onPress={() =>
            router.push(
              codeToPreserve
                ? { pathname: '/(auth)/register', params: { pendingCode: codeToPreserve } }
                : '/(auth)/register',
            )
          }
          activeOpacity={1}
          accessibilityLabel="Get Started"
          accessibilityRole="button"
        />

        <TouchableOpacity
          style={[s.zone, zone('enter')]}
          onPress={() =>
            router.push(
              codeToPreserve
                ? { pathname: '/(auth)/pair', params: { prefilledCode: codeToPreserve } }
                : '/(auth)/pair',
            )
          }
          activeOpacity={1}
          accessibilityLabel="Already have a code? Enter"
          accessibilityRole="button"
        />

        <TouchableOpacity
          style={[s.zone, zone('signIn')]}
          onPress={() =>
            router.push(
              codeToPreserve
                ? { pathname: '/(auth)/login', params: { pendingCode: codeToPreserve } }
                : '/(auth)/login',
            )
          }
          activeOpacity={1}
          accessibilityLabel="Already have an account? Sign In"
          accessibilityRole="button"
        />

        <TouchableOpacity
          style={[s.zone, zone('seeHow')]}
          onPress={() => router.push('/(auth)/onboarding-preview')}
          activeOpacity={1}
          accessibilityLabel="See how it works"
          accessibilityRole="button"
        />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
  },
  zone: {
    position: 'absolute',
  },
});
