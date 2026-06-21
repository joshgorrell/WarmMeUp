import { Platform } from 'react-native';

let configured = false;
let configurePromise: Promise<void> | null = null;

async function ensureConfigured(): Promise<typeof import('react-native-purchases').default | null> {
  if (Platform.OS === 'web') return null;

  const iosKey = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY;
  const androidKey = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;
  const apiKey = Platform.OS === 'ios' ? iosKey : androidKey;
  if (!apiKey) return null;

  if (!configured) {
    if (!configurePromise) {
      configurePromise = (async () => {
        try {
          const Purchases = (await import('react-native-purchases')).default;
          Purchases.configure({ apiKey });
          configured = true;
        } catch {
          // Native module unavailable (simulator / web bundle fallback)
        } finally {
          configurePromise = null;
        }
      })();
    }
    await configurePromise;
  }

  if (!configured) return null;
  return (await import('react-native-purchases')).default;
}

export { ensureConfigured };
