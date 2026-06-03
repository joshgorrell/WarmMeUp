import React, { Component, useEffect, useRef, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { DarkTheme, ThemeProvider as NavThemeProvider } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { useFrameworkReady } from '@/hooks/useFrameworkReady';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { ThemeProvider } from '@/context/ThemeContext';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet, View, TouchableOpacity, AppState, AppStateStatus, Platform, Image } from 'react-native';
import AppText from '@/components/AppText';
import type { NotificationData } from '@/lib/notifications';

// Warm the image decode cache as early as possible — before the transition/unlock screens mount.
// resolveAssetSource works on both native (file URI) and web (network URL).
const PREFETCH_LOGO = require('@/assets/images/image_(3).png');
const PREFETCH_SLOGAN = require('@/assets/images/image_(2).png');
if (Platform.OS !== 'web') {
  Image.prefetch(Image.resolveAssetSource(PREFETCH_LOGO).uri);
  Image.prefetch(Image.resolveAssetSource(PREFETCH_SLOGAN).uri);
}

class ErrorBoundary extends Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }
  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, backgroundColor: '#07070A', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
          <AppText style={{ color: '#fff', fontSize: 16, textAlign: 'center', paddingHorizontal: 32 }}>
            Something went wrong.
          </AppText>
          <TouchableOpacity
            onPress={() => this.setState({ hasError: false })}
            style={{ backgroundColor: '#FF2E8A', paddingHorizontal: 28, paddingVertical: 12, borderRadius: 24 }}
            activeOpacity={0.8}
          >
            <AppText style={{ color: '#fff', fontSize: 15, fontFamily: 'Inter-SemiBold' }}>Try Again</AppText>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

// Shared ref to store a pending deep-link intent from a notification tap.
// The gate sequence (stealth → unlock → transition) reads this and navigates after passing all gates.
export const pendingNotificationRoute = { current: null as NotificationData | null };

// Configure how notifications appear when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

SplashScreen.preventAutoHideAsync();

function PrivacyOverlay() {
  const { settings } = useAuth();
  const [hidden, setHidden] = useState(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  // Native: hide content in OS app switcher
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      const prev = appStateRef.current;
      appStateRef.current = next;
      const blurEnabled = settings?.blur_on_background ?? true;
      if (!blurEnabled) { setHidden(false); return; }
      if (next === 'inactive' || next === 'background') {
        setHidden(true);
      } else if (next === 'active' && (prev === 'inactive' || prev === 'background')) {
        setHidden(false);
      }
    });
    return () => sub.remove();
  }, [settings?.blur_on_background]);

  // Web: hide content when the tab/window loses visibility (tab switch, minimize, lock screen)
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onVisibility = () => {
      const blurEnabled = settings?.blur_on_background ?? true;
      if (!blurEnabled) { setHidden(false); return; }
      setHidden(document.hidden);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [settings?.blur_on_background]);

  // Web: CSS print-media rule so browser print/screenshot tools render a blank page
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const style = document.createElement('style');
    style.id = 'warmup-print-guard';
    style.textContent = '@media print { body { visibility: hidden !important; filter: blur(40px) !important; } }';
    document.head.appendChild(style);
    const onBeforePrint = () => setHidden(true);
    const onAfterPrint = () => setHidden(false);
    window.addEventListener('beforeprint', onBeforePrint);
    window.addEventListener('afterprint', onAfterPrint);
    return () => {
      style.remove();
      window.removeEventListener('beforeprint', onBeforePrint);
      window.removeEventListener('afterprint', onAfterPrint);
    };
  }, []);

  if (!hidden) return null;
  return (
    <View
      style={[StyleSheet.absoluteFillObject, { backgroundColor: '#07070A', zIndex: 9999 }]}
      pointerEvents="none"
    />
  );
}

/**
 * Listens for notification taps and stores the intent in pendingNotificationRoute.
 * Navigation is deferred — the gate sequence (stealth/unlock/transition) reads the
 * pending intent after the user has passed all locks and routes accordingly.
 */
function NotificationHandler() {
  useEffect(() => {
    if (Platform.OS === 'web') return;

    // Handle taps on notifications received while app is backgrounded / closed
    const sub = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data as unknown as NotificationData | undefined;
      if (data && typeof data.event_type === 'string') {
        pendingNotificationRoute.current = data;
      }
    });

    return () => sub.remove();
  }, []);

  return null;
}

function SessionGuard() {
  const { session, loading } = useAuth();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (loading) return;
    if (session) return;
    // Protect authenticated app/admin routes AND the weather/unlock screens —
    // those must only be reachable by a confirmed logged-in user.
    const inAuthenticatedRoute =
      segments[0] === '(app)' ||
      segments[0] === '(admin)' ||
      segments[0] === 'weather' ||
      segments[0] === 'unlock';
    if (inAuthenticatedRoute) {
      router.replace('/(auth)/welcome');
    }
  }, [session, loading, segments]);

  return null;
}

function BackgroundLockManager() {
  const { session, settings, lockIfNeeded, isAuthenticatingRef, refreshCouple } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const wasBackgroundedRef = useRef(false);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      appStateRef.current = next;

      if (next === 'background' || next === 'inactive') {
        wasBackgroundedRef.current = true;
      } else if (next === 'active' && wasBackgroundedRef.current) {
        wasBackgroundedRef.current = false;

        // Refresh couple data on every foreground trip so invite codes and
        // partner status are never stale after background/OTA transitions.
        refreshCouple();

        const method = settings?.login_method ?? 'none';
        if (!session || method === 'none' || method === 'password') return;

        // Don't interrupt an already-open biometric prompt. The vault or unlock
        // screen will handle the lock state themselves once the prompt resolves.
        if (isAuthenticatingRef.current) return;

        // Use lockIfNeeded() — it measures elapsed time from the last unlock
        // timestamp (persisted in SecureStore), so "5 min" means 5 minutes from
        // last unlock regardless of how many background trips occurred.
        const didLock = lockIfNeeded();
        if (didLock) {
          const currentRoute = segments[segments.length - 1];
          // 'weather' handles its own lock decision via handleCoastIsClear.
          // 'transition' and 'unlock' are already in the lock/auth flow.
          const safeRoutes = ['unlock', 'transition', 'weather'];
          if (!safeRoutes.includes(currentRoute)) {
            router.replace('/unlock');
          }
        }
      }
    });

    return () => sub.remove();
  }, [session, settings?.login_method, lockIfNeeded, isAuthenticatingRef, refreshCouple]);

  return null;
}

export default function RootLayout() {
  useFrameworkReady();

  const [fontsLoaded, fontError] = useFonts({
    'Inter-Regular': Inter_400Regular,
    'Inter-Medium': Inter_500Medium,
    'Inter-SemiBold': Inter_600SemiBold,
    'Inter-Bold': Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <ErrorBoundary>
    <GestureHandlerRootView style={styles.root}>
      <NavThemeProvider value={DarkTheme}>
      <ThemeProvider>
        <AuthProvider>
          <Stack screenOptions={{ headerShown: false, animation: 'fade', contentStyle: { backgroundColor: '#05040A' } }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="weather" />
            <Stack.Screen name="transition" />
            <Stack.Screen name="unlock" />
            <Stack.Screen name="debug" />
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(app)" />
            <Stack.Screen name="(admin)" />
            <Stack.Screen name="+not-found" />
          </Stack>
          <PrivacyOverlay />
          <SessionGuard />
          <BackgroundLockManager />
          <NotificationHandler />
          <StatusBar style="light" />
        </AuthProvider>
      </ThemeProvider>
      </NavThemeProvider>
    </GestureHandlerRootView>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#05040A' },
});
