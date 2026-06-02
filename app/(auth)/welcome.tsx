import React, { useEffect } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ImageBackground,
  Dimensions,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

const { width: SW, height: SH } = Dimensions.get('window');

const LOGIN_BG = require('@/assets/onboarding/New_Login_page_6.2.26.png');

export default function WelcomeScreen() {
  const router = useRouter();
  const { pendingCode, prefilledCode, code } = useLocalSearchParams<{
    pendingCode?: string;
    prefilledCode?: string;
    code?: string;
  }>();
  const codeToPreserve = (pendingCode || prefilledCode || code || '').toUpperCase().trim();

  // If a code arrived via deep-link params, forward immediately to pair screen.
  useEffect(() => {
    if (codeToPreserve) {
      router.replace({ pathname: '/(auth)/pair', params: { prefilledCode: codeToPreserve } });
    }
  }, [codeToPreserve]);

  // The image contains all visual branding — logo, wordmark, tagline, feature
  // icons, and button artwork. We render only invisible tap zones aligned to
  // the baked-in button/link positions.
  //
  // Tap zone offsets are expressed as fractions of SH so they scale across
  // iPhone SE (667 pt) through Pro Max (932 pt). The image uses `contain` so
  // it is never cropped; the black background fills any letterbox bands.
  //
  // Reference frame: 390 × 844 pt (iPhone 14)
  //   "Get Started" pill centre: ~82.5 % from top
  //   "Enter" link row:          ~88.0 %
  //   "Sign In" link row:        ~92.0 %
  //   "See how it works →":      ~95.5 %

  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      <ImageBackground
        source={LOGIN_BG}
        style={styles.bg}
        resizeMode="contain"
        accessibilityLabel="Warm Me Up – Stay Playful"
      />

      {/* Invisible hit areas only — zero visible styling */}
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">

        {/* Get Started */}
        <TouchableOpacity
          style={[styles.zone, { top: SH * 0.822, height: 58 }]}
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

        {/* Already have a code? Enter */}
        <TouchableOpacity
          style={[styles.zone, { top: SH * 0.875, height: 40 }]}
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

        {/* Already have an account? Sign In */}
        <TouchableOpacity
          style={[styles.zone, { top: SH * 0.912, height: 40 }]}
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

        {/* See how it works → */}
        <TouchableOpacity
          style={[styles.zone, { top: SH * 0.950, height: 36 }]}
          onPress={() => router.push('/(auth)/onboarding-preview')}
          activeOpacity={1}
          accessibilityLabel="See how it works"
          accessibilityRole="button"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
  },
  bg: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: SW,
    height: SH,
  },
  // Base style shared by all invisible tap zones
  zone: {
    position: 'absolute',
    left: '6%',
    right: '6%',
  },
});
