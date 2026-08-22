import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as ScreenCapture from 'expo-screen-capture';

/**
 * Protects sensitive media from screenshots, screen recording and mirroring
 * only while that media is active and capture is not allowed by its owner.
 *
 * A unique key keeps this protection isolated from any other privacy guards.
 * Normal app use is unaffected and capture is restored as soon as the media
 * becomes inactive or its owner allows screen capture.
 */
export function useProtectedScreenCapture(
  protectedContent: boolean,
  key = 'warm-me-up-private-media',
) {
  useEffect(() => {
    if (Platform.OS === 'web') return;

    let mounted = true;

    const sync = async () => {
      try {
        if (protectedContent) {
          await ScreenCapture.preventScreenCaptureAsync(key);
          if (Platform.OS === 'ios') {
            // Also hides protected content in app-switcher/background snapshots.
            await ScreenCapture.enableAppSwitcherProtectionAsync(1);
          }
        } else {
          await ScreenCapture.allowScreenCaptureAsync(key);
          if (Platform.OS === 'ios') {
            await ScreenCapture.disableAppSwitcherProtectionAsync();
          }
        }
      } catch {
        // Privacy protection must never crash or interrupt normal media viewing.
      }
    };

    sync();

    return () => {
      mounted = false;
      if (Platform.OS !== 'web') {
        ScreenCapture.allowScreenCaptureAsync(key).catch(() => {});
        if (Platform.OS === 'ios') {
          ScreenCapture.disableAppSwitcherProtectionAsync().catch(() => {});
        }
      }
    };
  }, [protectedContent, key]);
}
