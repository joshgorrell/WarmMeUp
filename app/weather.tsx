import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, StyleSheet, TouchableOpacity, ScrollView, useWindowDimensions, Platform, Linking,
  Animated, Easing,
} from 'react-native';
import AppText from '@/components/AppText';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Cloud, Wind, EyeOff, MapPin, MoveHorizontal as MoreHorizontal } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth, computeIsUnlockRequired } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { Spacing, FontSize, Radius } from '@/constants/theme';
import StealthBypassSheet from '@/components/StealthBypassSheet';
import { setWeatherSessionCache } from '@/hooks/useWeather';

// Shown only when permission is denied and no cached coords exist
const FALLBACK = {
  location: 'San Diego, CA',
  currentTemp: '72°',
  condition: 'Partly Cloudy',
  hiLo: 'H: 75°  L: 63°',
  humidity: '68%',
  uvIndex: '6',
  visibility: '10 mi',
  hourly: [
    { time: 'Now', temp: '72°', icon: '⛅' },
    { time: '10AM', temp: '73°', icon: '🌤' },
    { time: '11AM', temp: '74°', icon: '🌤' },
    { time: '12PM', temp: '75°', icon: '☀️' },
    { time: '1PM', temp: '75°', icon: '☀️' },
    { time: '2PM', temp: '75°', icon: '☀️' },
    { time: '3PM', temp: '74°', icon: '🌤' },
    { time: '4PM', temp: '72°', icon: '⛅' },
  ],
  forecast: [
    { day: 'Wednesday', cond: 'Partly Cloudy', high: '76°', low: '64°', icon: '🌤' },
    { day: 'Thursday', cond: 'Mostly Sunny', high: '77°', low: '65°', icon: '☀️' },
    { day: 'Friday', cond: 'Sunny', high: '78°', low: '66°', icon: '☀️' },
    { day: 'Saturday', cond: 'Partly Cloudy', high: '76°', low: '64°', icon: '⛅' },
    { day: 'Sunday', cond: 'Sunny', high: '74°', low: '63°', icon: '☀️' },
  ],
};

type WeatherData = typeof FALLBACK;

async function fetchWeatherForCoords(lat: number, lon: number): Promise<WeatherData> {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
  const res = await fetch(
    `${supabaseUrl}/functions/v1/weather?lat=${lat}&lon=${lon}`,
    { headers: { Authorization: `Bearer ${supabaseAnonKey}` } }
  );
  if (!res.ok) throw new Error('Weather fetch failed');
  return res.json();
}

async function cacheCoords(userId: string, lat: number, lon: number) {
  await supabase
    .from('user_settings')
    .update({ weather_lat: lat, weather_lon: lon, updated_at: new Date().toISOString() })
    .eq('user_id', userId);
}

const DEBUG_TAP_TARGET = 5;
const DEBUG_TAP_WINDOW_MS = 10000;

// Shimmer skeleton block
function SkeletonBlock({ shimmer, style }: { shimmer: Animated.Value; style?: object }) {
  const bg = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(255,255,255,0.06)', 'rgba(255,255,255,0.13)'],
  });
  return <Animated.View style={[styles.skeletonBlock, { backgroundColor: bg }, style]} />;
}

// Loading state: animated cloud icon + pulsing pin + skeleton cards
function WeatherLoading({ shimmer, pinPulse, dotCount }: {
  shimmer: Animated.Value;
  pinPulse: Animated.Value;
  dotCount: number;
}) {
  const dots = '.'.repeat(dotCount);

  return (
    <View style={styles.loadingRoot}>
      {/* Icon cluster */}
      <View style={styles.loadingIconCluster}>
        <Animated.View style={{ opacity: shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.85] }) }}>
          <Cloud color="rgba(180,210,255,0.85)" size={56} strokeWidth={1.4} />
        </Animated.View>
        <Animated.View style={[styles.loadingPinBadge, { opacity: pinPulse }]}>
          <MapPin color="rgba(120,190,255,0.9)" size={18} strokeWidth={2} />
        </Animated.View>
      </View>

      {/* Copy */}
      <AppText style={styles.loadingHeadline}>
        {'Locating'}<AppText style={styles.loadingDots}>{dots}</AppText>
      </AppText>
      <AppText style={styles.loadingSubtitle}>Checking local conditions…</AppText>

      {/* Skeleton temperature block */}
      <View style={styles.skeletonTopSection}>
        <SkeletonBlock shimmer={shimmer} style={styles.skeletonTemp} />
        <SkeletonBlock shimmer={shimmer} style={styles.skeletonCondition} />
        <SkeletonBlock shimmer={shimmer} style={styles.skeletonHiLo} />
      </View>

      {/* Skeleton hourly card */}
      <View style={styles.skeletonCard}>
        <View style={styles.skeletonCardHeader}>
          <SkeletonBlock shimmer={shimmer} style={styles.skeletonHeaderBar} />
        </View>
        <View style={styles.skeletonDivider} />
        <View style={styles.skeletonHourlyRow}>
          {Array.from({ length: 6 }).map((_, i) => (
            <View key={i} style={styles.skeletonHourItem}>
              <SkeletonBlock shimmer={shimmer} style={styles.skeletonHourTime} />
              <SkeletonBlock shimmer={shimmer} style={styles.skeletonHourIcon} />
              <SkeletonBlock shimmer={shimmer} style={styles.skeletonHourTemp} />
            </View>
          ))}
        </View>
      </View>

      {/* Skeleton 5-day card */}
      <View style={styles.skeletonCard}>
        <View style={styles.skeletonCardHeader}>
          <SkeletonBlock shimmer={shimmer} style={styles.skeletonHeaderBar} />
        </View>
        <View style={styles.skeletonDivider} />
        {Array.from({ length: 5 }).map((_, i) => (
          <View key={i} style={[styles.skeletonForecastRow, i < 4 && styles.skeletonForecastDivider]}>
            <SkeletonBlock shimmer={shimmer} style={styles.skeletonForecastDay} />
            <SkeletonBlock shimmer={shimmer} style={styles.skeletonForecastIcon} />
            <SkeletonBlock shimmer={shimmer} style={styles.skeletonForecastCond} />
            <SkeletonBlock shimmer={shimmer} style={styles.skeletonForecastTemp} />
          </View>
        ))}
      </View>

      {/* Skeleton extras row */}
      <View style={styles.extraRow}>
        {Array.from({ length: 3 }).map((_, i) => (
          <View key={i} style={styles.skeletonExtraCard}>
            <SkeletonBlock shimmer={shimmer} style={styles.skeletonExtraLabel} />
            <SkeletonBlock shimmer={shimmer} style={styles.skeletonExtraValue} />
          </View>
        ))}
      </View>
    </View>
  );
}

export default function WeatherScreen() {
  const router = useRouter();
  const { session, loading, user, profile, settings, unlockedAtMs, refreshSettings, unlockApp, isAuthenticatingRef, debugModeEnabled, refreshSubscription } = useAuth();
  const debugTapCount = useRef(0);
  const debugTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debugLongPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();

  // Warm up subscription data while the user views the weather screen so that
  // tapping "The Coast is Clear" can route through transition.tsx immediately
  // without waiting on a cold subscription fetch.
  useEffect(() => {
    refreshSubscription().catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Hard session guard — this screen is exclusively for confirmed logged-in users.
  // SessionGuard in _layout.tsx handles the global case, but guard here too so
  // a stale navigation state or direct push can never strand a guest on this screen.
  useEffect(() => {
    console.log('[WEATHER ENTRY]', {
      userId: user?.id ?? session?.user?.id,
      loginMethod: settings?.login_method,
      stealthEnabled: settings?.stealth_mode_enabled,
      stealthBypassUntil: settings?.stealth_bypass_until,
      hasSession: !!session,
    });
    if (!loading && !session) {
      router.replace('/(auth)/welcome');
    }
  }, [loading, session]);

  const { width } = useWindowDimensions();
  const tempFontSize = Math.min(Math.round(width * 0.24), 100);
  const forecastDayWidth = width >= 600 ? 110 : 90;
  const [showStealthSheet, setShowStealthSheet] = useState(false);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);

  // Refs so the GPS effect and the settings effect can coordinate without
  // re-triggering each other.
  const gpsCoords = useRef<{ lat: number; lon: number } | null>(null);
  const gpsDone = useRef(false);
  const cancelled = useRef(false);

  // --- Animation values ---
  const shimmer = useRef(new Animated.Value(0)).current;
  const pinPulse = useRef(new Animated.Value(0.5)).current;
  const contentFade = useRef(new Animated.Value(0)).current;
  const [dotCount, setDotCount] = useState(1);

  // Shimmer loop
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, {
          toValue: 1, duration: 1100, easing: Easing.inOut(Easing.ease), useNativeDriver: false,
        }),
        Animated.timing(shimmer, {
          toValue: 0, duration: 1100, easing: Easing.inOut(Easing.ease), useNativeDriver: false,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  // Pin pulse loop (native driver safe — only opacity)
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pinPulse, {
          toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true,
        }),
        Animated.timing(pinPulse, {
          toValue: 0.3, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  // Animated dots while loading
  useEffect(() => {
    if (weather !== null) return;
    const id = setInterval(() => {
      setDotCount(c => (c % 3) + 1);
    }, 500);
    return () => clearInterval(id);
  }, [weather]);

  // Fade in content when weather arrives
  useEffect(() => {
    if (weather !== null) {
      Animated.timing(contentFade, {
        toValue: 1, duration: 380, easing: Easing.out(Easing.ease), useNativeDriver: true,
      }).start();
    }
  }, [weather]);

  const canAccessDebug =
    __DEV__ ||
    profile?.is_admin === true ||
    debugModeEnabled ||
    process.env.EXPO_PUBLIC_DEBUG_ALWAYS_ON === '1';

  const handleDebugTap = () => {
    if (!canAccessDebug) return;
    debugTapCount.current += 1;
    if (debugTapTimer.current) clearTimeout(debugTapTimer.current);
    if (debugTapCount.current >= DEBUG_TAP_TARGET) {
      debugTapCount.current = 0;
      router.replace('/debug');
      return;
    }
    debugTapTimer.current = setTimeout(() => {
      debugTapCount.current = 0;
    }, DEBUG_TAP_WINDOW_MS);
  };

  const handleDebugLongPressIn = useCallback(() => {
    if (!canAccessDebug) return;
    debugLongPressTimer.current = setTimeout(() => {
      debugLongPressTimer.current = null;
      router.replace('/debug');
    }, 5000);
  }, [canAccessDebug, router]);

  const handleDebugLongPressOut = useCallback(() => {
    if (debugLongPressTimer.current) {
      clearTimeout(debugLongPressTimer.current);
      debugLongPressTimer.current = null;
    }
  }, []);

  // Hard timeout: 6s fallback so the screen never stays permanently blank.
  useEffect(() => {
    const t = setTimeout(() => {
      if (!cancelled.current) setWeather(prev => prev ?? FALLBACK);
    }, 6000);
    return () => {
      cancelled.current = true;
      clearTimeout(t);
    };
  }, []);

  // Effect 1: Start GPS warm-up immediately on mount — don't wait for settings.
  useEffect(() => {
    (async () => {
      try {
        let lat: number, lon: number;

        if (Platform.OS === 'web') {
          if (!navigator?.geolocation) {
            if (!cancelled.current) setWeather(prev => prev ?? FALLBACK);
            return;
          }
          const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000 })
          );
          lat = pos.coords.latitude;
          lon = pos.coords.longitude;
        } else {
          const Location = await import('expo-location');
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status !== 'granted') {
            if (!cancelled.current) {
              setPermissionDenied(true);
              setWeather(prev => prev ?? FALLBACK);
            }
            gpsDone.current = true;
            return;
          }
          const pos = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          lat = pos.coords.latitude;
          lon = pos.coords.longitude;
        }

        if (cancelled.current) return;
        gpsCoords.current = { lat, lon };
        gpsDone.current = true;

        try {
          const data = await fetchWeatherForCoords(lat, lon);
          if (!cancelled.current) {
            setWeather(data);
            setWeatherSessionCache(data.currentTemp);
          }
        } catch (e) {
          console.warn('[weather] GPS fetch failed:', e);
          if (!cancelled.current) setWeather(prev => prev ?? FALLBACK);
        }

        // Persist coords for instant display next open
        if (user?.id) {
          cacheCoords(user.id, lat, lon);
        }
      } catch (e) {
        console.warn('[weather] GPS error:', e);
        if (!cancelled.current) setWeather(prev => prev ?? FALLBACK);
        gpsDone.current = true;
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Effect 2: When settings load, use cached coords to show weather immediately —
  // but only if GPS hasn't already resolved (to avoid overwriting a fresher result).
  useEffect(() => {
    if (settings === null) return;
    const cachedLat = settings.weather_lat;
    const cachedLon = settings.weather_lon;
    if (cachedLat == null || cachedLon == null) return;
    // Skip only if GPS actually resolved real coords — gpsCoords.current is set
    // only on a successful fix. If GPS was denied, we still want cached coords.
    if (gpsCoords.current !== null) return;

    (async () => {
      try {
        const data = await fetchWeatherForCoords(cachedLat, cachedLon);
        if (!cancelled.current) {
          // Don't overwrite a live GPS result that may have arrived while fetching.
          if (gpsCoords.current === null) {
            setWeather(prev => prev ?? data);
            setWeatherSessionCache(data.currentTemp);
          }
        }
      } catch (e) {
        console.warn('[weather] cached coords fetch failed:', e);
      }
    })();
  // weather is intentionally excluded — we only want to run this when settings loads.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  const handleCoastIsClear = async () => {
    // Signal BackgroundLockManager to stand down — it must not race a router.replace
    // call with its own router.replace('/unlock') while we're deciding where to go.
    isAuthenticatingRef.current = true;
    try {
      // Resolve userId — fall back to the live session if AuthContext user isn't populated yet.
      let userId = user?.id;
      if (!userId) {
        const { data: { session: liveSession } } = await supabase.auth.getSession();
        userId = liveSession?.user?.id;
      }

      // If settings haven't loaded yet, fetch BOTH login_method AND lock_after_seconds
      // from the DB. Both are required by computeIsUnlockRequired — a partial object
      // missing lock_after_seconds causes it to always return false and skip the unlock.
      let liveSettings = settings;
      if (!liveSettings && userId) {
        const { data } = await supabase
          .from('user_settings')
          .select('login_method, lock_after_seconds')
          .eq('user_id', userId)
          .maybeSingle();
        if (data) {
          liveSettings = data as any;
        }
      }

      // Use the shared computeIsUnlockRequired so lock_after_seconds=-1 NEVER
      // routes to /unlock, even if login_method was left as 'pin' in the DB.
      const mustLock = computeIsUnlockRequired(liveSettings ?? null, unlockedAtMs);
      if (mustLock) {
        router.replace('/unlock');
      } else {
        unlockApp();
        router.replace('/transition');
      }
    } finally {
      // Clear after a short delay so the navigation action has dispatched before
      // BackgroundLockManager is allowed to fire again.
      setTimeout(() => { isAuthenticatingRef.current = false; }, 500);
    }
  };

  const handleBypass = async (hours: number) => {
    setShowStealthSheet(false);
    if (!user) return;
    const until = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
    await supabase
      .from('user_settings')
      .upsert({ user_id: user.id, stealth_bypass_until: until, updated_at: new Date().toISOString() });
    await refreshSettings();
    router.replace('/transition');
  };

  return (
    <View style={styles.container}>
      {/* Deep blue sky gradient */}
      <LinearGradient
        colors={['#0a1628', '#112240', '#0d1f3c', '#07111f']}
        locations={[0, 0.3, 0.65, 1]}
        style={StyleSheet.absoluteFill}
      />
      {/* Subtle horizon glow */}
      <LinearGradient
        colors={['transparent', 'rgba(255,140,60,0.10)', 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={[StyleSheet.absoluteFill, { top: '35%', height: '30%' }]}
      />

      {/* Top bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + 12 }]}>
        <View style={styles.locationRow}>
          <Animated.View style={{ opacity: weather ? 1 : pinPulse }}>
            <MapPin color="rgba(255,255,255,0.8)" size={14} />
          </Animated.View>
          <AppText style={styles.location}>
            {weather ? weather.location : 'Locating…'}
          </AppText>
        </View>

        <View style={styles.topRight}>
          <TouchableOpacity style={styles.dotsBtn} activeOpacity={0.6}>
            <MoreHorizontal color="rgba(255,255,255,0.5)" size={20} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 72 }]}
        showsVerticalScrollIndicator={false}
      >
        {weather ? (
          <Animated.View style={{ opacity: contentFade }}>
            {/* Main temp — 5-tap opens debug when admin has enabled debug mode */}
            <TouchableOpacity
              onPress={handleDebugTap}
              activeOpacity={1}
              style={styles.topSection}
            >
              <AppText style={[styles.temp, { fontSize: tempFontSize, lineHeight: tempFontSize * 1.08 }]}>
                {weather.currentTemp}
              </AppText>
              <AppText style={styles.condition}>{weather.condition}</AppText>
              <AppText style={styles.hiLo}>{weather.hiLo}</AppText>
              {permissionDenied && (
                <TouchableOpacity onPress={() => Linking.openSettings()} activeOpacity={0.7}>
                  <AppText style={styles.permissionHint}>
                    Enable Location in Settings for local weather
                  </AppText>
                </TouchableOpacity>
              )}
            </TouchableOpacity>

            {/* Hourly */}
            <View style={styles.card}>
              <View style={styles.cardRow}>
                <Wind color="rgba(255,255,255,0.45)" size={13} />
                <AppText style={styles.cardLabel}>HOURLY FORECAST</AppText>
              </View>
              <View style={styles.divider} />
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.hourlyRow}>
                  {weather.hourly.map((h) => (
                    <View key={h.time} style={styles.hourItem}>
                      <AppText style={styles.hourTime}>{h.time}</AppText>
                      <AppText style={styles.hourIcon}>{h.icon}</AppText>
                      <AppText style={styles.hourTemp}>{h.temp}</AppText>
                    </View>
                  ))}
                </View>
              </ScrollView>
            </View>

            {/* 5-day */}
            <View style={styles.card}>
              <View style={styles.cardRow}>
                <Cloud color="rgba(255,255,255,0.45)" size={13} />
                <AppText style={styles.cardLabel}>5-DAY FORECAST</AppText>
              </View>
              <View style={styles.divider} />
              {weather.forecast.map((f, i) => (
                <View
                  key={f.day}
                  style={[styles.forecastRow, i < weather.forecast.length - 1 && styles.forecastDivider]}
                >
                  <AppText style={[styles.forecastDay, { width: forecastDayWidth }]}>{f.day}</AppText>
                  <AppText style={styles.forecastIcon}>{f.icon}</AppText>
                  <AppText style={styles.forecastCond}>{f.cond}</AppText>
                  <View style={styles.forecastTemps}>
                    <AppText style={styles.forecastHigh}>{f.high}</AppText>
                    <AppText style={styles.forecastLow}>{f.low}</AppText>
                  </View>
                </View>
              ))}
            </View>

            {/* Extra tiles */}
            <View style={styles.extraRow}>
              {[
                { label: 'HUMIDITY', val: weather.humidity },
                { label: 'UV INDEX', val: weather.uvIndex },
                { label: 'VISIBILITY', val: weather.visibility },
              ].map((e) => (
                <View key={e.label} style={styles.extraCard}>
                  <AppText style={styles.extraLabel}>{e.label}</AppText>
                  <AppText style={styles.extraValue}>{e.val}</AppText>
                </View>
              ))}
            </View>
          </Animated.View>
        ) : (
          <WeatherLoading shimmer={shimmer} pinPulse={pinPulse} dotCount={dotCount} />
        )}

        {/* Spacer so content isn't hidden under the absolute-positioned bottom button */}
        <View style={{ height: insets.bottom + 120 }} />
      </ScrollView>

      {/* Coast is Clear button — hold 5s for emergency debug access */}
      <View style={[styles.bottomArea, { paddingBottom: insets.bottom + 24 }]}>
        <TouchableOpacity
          style={styles.clearBtn}
          onPress={handleCoastIsClear}
          onPressIn={handleDebugLongPressIn}
          onPressOut={handleDebugLongPressOut}
          activeOpacity={0.88}
        >
          <View style={styles.clearBtnInner}>
            <AppText style={styles.waveEmoji}>〰</AppText>
            <AppText style={styles.clearBtnText}>The Coast is Clear</AppText>
          </View>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={[styles.stealthIcon, { bottom: insets.bottom + 30 }]}
        onPress={() => setShowStealthSheet(true)}
        activeOpacity={0.5}
        accessibilityRole="button"
        accessibilityLabel="Temporarily disable Privacy Mode"
      >
        <EyeOff color="rgba(255,255,255,0.18)" size={17} />
      </TouchableOpacity>

      <StealthBypassSheet
        visible={showStealthSheet}
        onClose={() => setShowStealthSheet(false)}
        onSelect={handleBypass}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#07111f' },
  topBar: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl, paddingBottom: Spacing.sm,
  },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  location: {
    color: 'rgba(255,255,255,0.9)', fontSize: FontSize.md,
    fontFamily: 'Inter-SemiBold', letterSpacing: 0.3,
  },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dotsBtn: { padding: 4 },
  scroll: { paddingHorizontal: Spacing.md, paddingBottom: 20 },
  topSection: { alignItems: 'center', marginBottom: Spacing.xl, paddingTop: Spacing.lg },
  temp: { color: '#fff', fontFamily: 'Inter-Bold', letterSpacing: -3 },
  condition: {
    color: 'rgba(255,255,255,0.8)', fontSize: FontSize.lg,
    fontFamily: 'Inter-Regular', marginTop: 2,
  },
  hiLo: {
    color: 'rgba(255,255,255,0.5)', fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular', marginTop: 6, letterSpacing: 0.5,
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: Radius.xl,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)', padding: Spacing.md, marginBottom: Spacing.sm,
  },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardLabel: {
    color: 'rgba(255,255,255,0.4)', fontSize: FontSize.xs,
    fontFamily: 'Inter-SemiBold', letterSpacing: 1.2,
  },
  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.07)', marginVertical: Spacing.sm },
  hourlyRow: { flexDirection: 'row', gap: Spacing.md, paddingVertical: Spacing.xs },
  hourItem: { alignItems: 'center', gap: 5, minWidth: 48 },
  hourTime: { color: 'rgba(255,255,255,0.55)', fontSize: FontSize.xs, fontFamily: 'Inter-Medium' },
  hourIcon: { fontSize: 22 },
  hourTemp: { color: '#fff', fontSize: FontSize.sm, fontFamily: 'Inter-SemiBold' },
  forecastRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11 },
  forecastDivider: { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  forecastDay: { color: '#fff', fontSize: FontSize.sm, fontFamily: 'Inter-SemiBold' },
  forecastIcon: { fontSize: 20, marginRight: Spacing.sm },
  forecastCond: { flex: 1, color: 'rgba(255,255,255,0.55)', fontSize: FontSize.sm, fontFamily: 'Inter-Regular' },
  forecastTemps: { flexDirection: 'row', gap: Spacing.sm },
  forecastHigh: {
    color: '#fff', fontSize: FontSize.sm, fontFamily: 'Inter-SemiBold',
    width: 36, textAlign: 'right',
  },
  forecastLow: {
    color: 'rgba(255,255,255,0.4)', fontSize: FontSize.sm, fontFamily: 'Inter-Regular',
    width: 36, textAlign: 'right',
  },
  extraRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.xs, marginBottom: Spacing.sm },
  extraCard: {
    flex: 1, backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: Radius.lg,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)', padding: Spacing.md, alignItems: 'center',
  },
  extraLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 9, fontFamily: 'Inter-SemiBold', letterSpacing: 0.8 },
  extraValue: { color: '#fff', fontSize: FontSize.xl, fontFamily: 'Inter-Bold', marginTop: 4 },
  bottomArea: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: Spacing.xl, paddingTop: Spacing.lg,
  },
  clearBtn: {
    borderRadius: Radius.pill, overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
  },
  clearBtnInner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, paddingVertical: 18, paddingHorizontal: Spacing.xl,
  },
  waveEmoji: { color: 'rgba(255,255,255,0.7)', fontSize: 18 },
  clearBtnText: { color: '#fff', fontSize: FontSize.md, fontFamily: 'Inter-SemiBold', letterSpacing: 0.2 },
  stealthIcon: { position: 'absolute', right: Spacing.xl, padding: 6 },
  permissionHint: {
    color: 'rgba(255,200,100,0.75)', fontSize: FontSize.xs,
    fontFamily: 'Inter-Regular', marginTop: 10, textDecorationLine: 'underline',
    textAlign: 'center',
  },

  // ── Loading state ──────────────────────────────────────────────────────────
  loadingRoot: {
    alignItems: 'center',
    paddingTop: Spacing.lg,
  },
  loadingIconCluster: {
    position: 'relative',
    marginBottom: Spacing.lg,
    width: 72,
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingPinBadge: {
    position: 'absolute',
    bottom: -4,
    right: -6,
  },
  loadingHeadline: {
    color: '#fff',
    fontSize: FontSize.xl,
    fontFamily: 'Inter-SemiBold',
    letterSpacing: 0.2,
    marginBottom: 6,
  },
  loadingDots: {
    color: 'rgba(180,210,255,0.7)',
    fontFamily: 'Inter-SemiBold',
  },
  loadingSubtitle: {
    color: 'rgba(255,255,255,0.38)',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
    marginBottom: Spacing.xl,
    letterSpacing: 0.1,
  },

  // Skeleton shared
  skeletonBlock: {
    borderRadius: 6,
  },

  // Skeleton temperature cluster
  skeletonTopSection: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
    gap: 10,
    width: '100%',
  },
  skeletonTemp: { width: 160, height: 80, borderRadius: 14 },
  skeletonCondition: { width: 120, height: 18, borderRadius: 9 },
  skeletonHiLo: { width: 90, height: 13, borderRadius: 6 },

  // Skeleton card wrapper
  skeletonCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    width: '100%',
  },
  skeletonCardHeader: { marginBottom: 8 },
  skeletonHeaderBar: { width: 100, height: 11, borderRadius: 5 },
  skeletonDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginBottom: Spacing.sm },

  // Skeleton hourly row
  skeletonHourlyRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  skeletonHourItem: { alignItems: 'center', gap: 5, minWidth: 40 },
  skeletonHourTime: { width: 28, height: 10, borderRadius: 5 },
  skeletonHourIcon: { width: 28, height: 28, borderRadius: 14 },
  skeletonHourTemp: { width: 24, height: 11, borderRadius: 5 },

  // Skeleton forecast rows
  skeletonForecastRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: Spacing.sm,
  },
  skeletonForecastDivider: { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  skeletonForecastDay: { width: 80, height: 12, borderRadius: 6 },
  skeletonForecastIcon: { width: 22, height: 22, borderRadius: 11 },
  skeletonForecastCond: { flex: 1, height: 12, borderRadius: 6 },
  skeletonForecastTemp: { width: 44, height: 12, borderRadius: 6 },

  // Skeleton extra cards
  skeletonExtraCard: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    padding: Spacing.md,
    alignItems: 'center',
    gap: 8,
  },
  skeletonExtraLabel: { width: 48, height: 9, borderRadius: 4 },
  skeletonExtraValue: { width: 32, height: 22, borderRadius: 6 },
});
