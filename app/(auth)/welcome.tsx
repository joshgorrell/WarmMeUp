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

// iPhone SE (1st/2nd gen) has a shorter screen — shift tap zones up slightly
const IS_SMALL   = SH < 700;
const SMALL_SHIFT = IS_SMALL ? -20 : 0;

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

  // The image contains all visual branding. We render only invisible tap zones
  // aligned to the baked-in button/link positions in the artwork.
  //
  // Reference frame: 390 × 844 pt (iPhone 14) with resizeMode="cover"
  //   "Get Started" pill centre: ~82.5 % from top
  //   "Enter" link row:          ~88.0 %
  //   "Sign In" link row:        ~92.0 %
  //   "See how it works →":      ~95.5 %

  const getStartedTop = SH * 0.822 + SMALL_SHIFT;
  const enterTop      = SH * 0.875 + SMALL_SHIFT;
  const signInTop     = SH * 0.912 + SMALL_SHIFT;
  const seeHowTop     = SH * 0.950 + SMALL_SHIFT;

  return (
    <View style={s.root}>
      <StatusBar style="light" />

      <ImageBackground
        source={LOGIN_BG}
        style={StyleSheet.absoluteFill}
        imageStyle={StyleSheet.absoluteFill}
        resizeMode="cover"
        accessibilityLabel="Warm Me Up – Stay Playful"
      />

      {/* Invisible hit areas only — no visible styling */}
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">

        {/* Get Started */}
        <TouchableOpacity
          style={[s.zone, { top: getStartedTop, height: 58 }]}
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
          style={[s.zone, { top: enterTop, height: 40 }]}
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
          style={[s.zone, { top: signInTop, height: 40 }]}
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
          style={[s.zone, { top: seeHowTop, height: 36 }]}
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
    left: '6%',
    right: '6%',
  },
});
