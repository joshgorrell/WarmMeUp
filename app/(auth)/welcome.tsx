import React, { useEffect, useState, useMemo } from 'react';
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

const LOGIN_BG = require('@/assets/onboarding/New_Login_page_6.2.26.png');

// ─── Tap zone positions expressed as fractions of the image canvas ─────────
// These fractions are applied to the *rendered* image rectangle at runtime,
// so they are correct regardless of the actual image pixel dimensions.
//
// Reference: artwork designed for iPhone 14 (390 × 844 pt).
// Adjust these if the console logs show zones are off.
const ZONES = {
  getStarted: { topFrac: 0.822, hFrac: 0.069, lFrac: 0.06, rFrac: 0.06 },
  enter:      { topFrac: 0.875, hFrac: 0.048, lFrac: 0.06, rFrac: 0.06 },
  signIn:     { topFrac: 0.912, hFrac: 0.048, lFrac: 0.06, rFrac: 0.06 },
  seeHow:     { topFrac: 0.950, hFrac: 0.043, lFrac: 0.06, rFrac: 0.06 },
} as const;

// ─── Runtime image size hook ─────────────────────────────────────────────────
function useImageSize(asset: ReturnType<typeof require>) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    let uri: string;
    try {
      uri = Image.resolveAssetSource(asset).uri;
    } catch (e) {
      console.warn('[useImageSize] resolveAssetSource threw, using fallback 390x844:', e);
      setSize({ w: 390, h: 844 });
      return;
    }
    Image.getSize(
      uri,
      (w, h) => {
        console.log(`[useImageSize] source image: ${w}x${h}px`);
        setSize({ w, h });
      },
      (err) => {
        console.warn('[useImageSize] getSize failed, using fallback 390x844:', err);
        setSize({ w: 390, h: 844 });
      },
    );
  }, []);

  return size;
}

// ─── Contain layout calculator ───────────────────────────────────────────────
function computeContainLayout(
  imgW: number,
  imgH: number,
  screenW: number,
  screenH: number,
  minOffsetY: number,
) {
  const scale = Math.min(screenW / imgW, screenH / imgH);
  const renderedW = imgW * scale;
  const renderedH = imgH * scale;
  const offsetX = (screenW - renderedW) / 2;
  const offsetY = Math.max((screenH - renderedH) / 2, minOffsetY);

  console.log(
    `[ContainLayout] screen: ${screenW}x${screenH} | image: ${imgW}x${imgH}` +
    ` | rendered: ${renderedW.toFixed(1)}x${renderedH.toFixed(1)}` +
    ` | offset: (${offsetX.toFixed(1)}, ${offsetY.toFixed(1)})`,
  );

  // Convert a zone definition into absolute screen-space style values.
  const toZone = (topFrac: number, hFrac: number, lFrac: number, rFrac: number) => {
    const zoneTop    = offsetY + topFrac  * renderedH;
    const zoneHeight = hFrac * renderedH;
    const zoneLeft   = offsetX + lFrac   * renderedW;
    // rFrac is the fraction from the image's RIGHT edge inward
    const zoneRight  = screenW - (offsetX + (1 - rFrac) * renderedW);
    console.log(
      `[ContainLayout] zone top=${zoneTop.toFixed(1)} h=${zoneHeight.toFixed(1)}` +
      ` left=${zoneLeft.toFixed(1)} right=${zoneRight.toFixed(1)}`,
    );
    return { top: zoneTop, height: zoneHeight, left: zoneLeft, right: zoneRight };
  };

  return { scale, renderedW, renderedH, offsetX, offsetY, toZone };
}

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function WelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { pendingCode, prefilledCode, code } = useLocalSearchParams<{
    pendingCode?: string;
    prefilledCode?: string;
    code?: string;
  }>();
  const codeToPreserve = (pendingCode || prefilledCode || code || '').toUpperCase().trim();

  useEffect(() => {
    if (codeToPreserve) {
      router.replace({ pathname: '/(auth)/pair', params: { prefilledCode: codeToPreserve } });
    }
  }, [codeToPreserve]);

  const imageSize = useImageSize(LOGIN_BG);

  const layout = useMemo(() => {
    if (!imageSize) return null;
    return computeContainLayout(imageSize.w, imageSize.h, SW, SH, insets.top);
  }, [imageSize, insets.top]);

  return (
    <View style={s.root}>
      <StatusBar style="light" />

      {/* Artwork — rendered only once dimensions are known so layout is correct */}
      {layout && (
        <Image
          source={LOGIN_BG}
          style={StyleSheet.absoluteFill}
          resizeMode="contain"
          accessibilityLabel="Warm Me Up – Stay Playful"
        />
      )}

      {/* Invisible tap zones — only mounted once layout is computed */}
      {layout && (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">

          <TouchableOpacity
            style={[s.zone, layout.toZone(...Object.values(ZONES.getStarted) as [number, number, number, number])]}
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
            style={[s.zone, layout.toZone(...Object.values(ZONES.enter) as [number, number, number, number])]}
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
            style={[s.zone, layout.toZone(...Object.values(ZONES.signIn) as [number, number, number, number])]}
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
            style={[s.zone, layout.toZone(...Object.values(ZONES.seeHow) as [number, number, number, number])]}
            onPress={() => router.push('/(auth)/onboarding-preview')}
            activeOpacity={1}
            accessibilityLabel="See how it works"
            accessibilityRole="button"
          />
        </View>
      )}
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
