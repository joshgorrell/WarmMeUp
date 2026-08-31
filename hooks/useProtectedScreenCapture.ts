import { useEffect } from 'react';
import { Platform } from 'react-native';

/**
 * Protects sensitive media from screenshots, screen recording and mirroring
 * only while that media is active and capture is not allowed by its owner.
 *
 * expo-screen-capture is loaded lazily so OTA updates remain compatible with
 * older native binaries that were built before the module was added. On those
 * binaries the import simply fails inside the guarded async path and media
 * viewing continues normally. New native builds get full capture protection.
 */
export function useProtectedScreenCapture(
  protectedContent: boolean,
  key = 'warm-me-up-private-media',
) {
  useEffect(() => {
    if (Platform.OS === 'web') return;

    let cancelled = false;

    const sync = async () => {
      try {
        const ScreenCapture = await import('expo-screen-capture');
        if (cancelled) return;

        if (protectedContent) {
          await ScreenCapture.preventScreenCaptureAsync(key);
          if (Platform.OS === 'ios') {
            await ScreenCapture.enableAppSwitcherProtectionAsync(1);
          }
        } else {
          await ScreenCapture.allowScreenCaptureAsync(key);
          if (Platform.OS === 'ios') {
            await ScreenCapture.disableAppSwitcherProtectionAsync();
          }
        }
      } catch {
        // Older OTA-compatible binaries may not contain the native module yet.
        // Never let missing capture protection interrupt normal media viewing.
      }
    };

    sync();

    return () => {
      cancelled = true;
      void (async () => {
        try {
          const ScreenCapture = await import('expo-screen-capture');
          await ScreenCapture.allowScreenCaptureAsync(key);
          if (Platform.OS === 'ios') {
            await ScreenCapture.disableAppSwitcherProtectionAsync();
          }
        } catch {
          // See note above: old native binaries may not have this module.
        }
      })();
    };
  }, [protectedContent, key]);
}
