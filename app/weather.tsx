import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, useWindowDimensions, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Cloud, Wind, EyeOff, MapPin, MoveHorizontal as MoreHorizontal, Bell } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { useActivityBadge } from '@/hooks/useActivityBadge';
import { supabase } from '@/lib/supabase';
import { Spacing, FontSize, Radius } from '@/constants/theme';
import StealthBypassSheet from '@/components/StealthBypassSheet';

// Hardcoded fallback — shown while loading or when GPS/network unavailable
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

export default function WeatherScreen() {
  const router = useRouter();
  const { user, settings, refreshSettings, unlockApp, lockIfNeeded } = useAuth();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const tempFontSize = Math.min(Math.round(width * 0.24), 100);
  const forecastDayWidth = width >= 600 ? 110 : 90;
  const [showStealthSheet, setShowStealthSheet] = useState(false);
  const [weather, setWeather] = useState<WeatherData>(FALLBACK);
  const badgeCount = useActivityBadge();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (Platform.OS === 'web') {
          if (!navigator?.geolocation) return;
          await new Promise<void>((resolve) => {
            navigator.geolocation.getCurrentPosition(
              async (pos) => {
                if (cancelled) { resolve(); return; }
                try {
                  const data = await fetchWeatherForCoords(pos.coords.latitude, pos.coords.longitude);
                  if (!cancelled) setWeather(data);
                } catch { /* keep fallback */ }
                resolve();
              },
              () => resolve(),
              { timeout: 8000 }
            );
          });
        } else {
          const Location = await import('expo-location');
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status !== 'granted' || cancelled) return;
          const pos = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          if (cancelled) return;
          const data = await fetchWeatherForCoords(pos.coords.latitude, pos.coords.longitude);
          if (!cancelled) setWeather(data);
        }
      } catch {
        // silently keep fallback
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleCoastIsClear = async () => {
    // Resolve userId — fall back to the live session if AuthContext user isn't populated yet.
    let userId = user?.id;
    if (!userId) {
      const { data: { session: liveSession } } = await supabase.auth.getSession();
      userId = liveSession?.user?.id;
    }

    // If settings haven't loaded yet, fetch login_method directly from the DB.
    let loginMethod = settings?.login_method;
    if (!loginMethod && userId) {
      const { data } = await supabase
        .from('user_settings')
        .select('login_method')
        .eq('user_id', userId)
        .maybeSingle();
      loginMethod = data?.login_method ?? 'pin';
    }
    loginMethod = loginMethod ?? 'pin';

    if (loginMethod === 'password') {
      // Password method has no lock gate — stamp unlock and go straight in.
      unlockApp();
      router.push('/transition');
      return;
    }

    // Check the timer BEFORE stamping — use the persisted unlock timestamp.
    const mustLock = lockIfNeeded();
    if (mustLock) {
      // Lock timer has expired (or never set) — require PIN/biometric.
      router.push(loginMethod === 'pin' || loginMethod === 'biometric' ? '/unlock' : '/(auth)/setup-pin');
    } else {
      // Still within grace period — stamp a fresh unlock time and go in.
      unlockApp();
      router.push('/transition');
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
    router.push('/transition');
  };

  const badgeLabel = badgeCount > 9 ? '9+' : String(badgeCount);

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
          <MapPin color="rgba(255,255,255,0.8)" size={14} />
          <Text style={styles.location}>{weather.location}</Text>
        </View>

        <View style={styles.topRight}>
          {/* Notification bell with badge — only shown when there are pending notifications */}
          {badgeCount > 0 && (
            <TouchableOpacity
              style={styles.bellBtn}
              onPress={handleCoastIsClear}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`${badgeCount} new activity`}
            >
              <Bell color="rgba(255,255,255,0.7)" size={20} />
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{badgeLabel}</Text>
              </View>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.dotsBtn} activeOpacity={0.6}>
            <MoreHorizontal color="rgba(255,255,255,0.5)" size={20} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 72 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Main temp */}
        <View style={styles.topSection}>
          <Text style={[styles.temp, { fontSize: tempFontSize, lineHeight: tempFontSize * 1.08 }]}>
            {weather.currentTemp}
          </Text>
          <Text style={styles.condition}>{weather.condition}</Text>
          <Text style={styles.hiLo}>{weather.hiLo}</Text>
        </View>

        {/* Hourly */}
        <View style={styles.card}>
          <View style={styles.cardRow}>
            <Wind color="rgba(255,255,255,0.45)" size={13} />
            <Text style={styles.cardLabel}>HOURLY FORECAST</Text>
          </View>
          <View style={styles.divider} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.hourlyRow}>
              {weather.hourly.map((h) => (
                <View key={h.time} style={styles.hourItem}>
                  <Text style={styles.hourTime}>{h.time}</Text>
                  <Text style={styles.hourIcon}>{h.icon}</Text>
                  <Text style={styles.hourTemp}>{h.temp}</Text>
                </View>
              ))}
            </View>
          </ScrollView>
        </View>

        {/* 5-day */}
        <View style={styles.card}>
          <View style={styles.cardRow}>
            <Cloud color="rgba(255,255,255,0.45)" size={13} />
            <Text style={styles.cardLabel}>5-DAY FORECAST</Text>
          </View>
          <View style={styles.divider} />
          {weather.forecast.map((f, i) => (
            <View
              key={f.day}
              style={[styles.forecastRow, i < weather.forecast.length - 1 && styles.forecastDivider]}
            >
              <Text style={[styles.forecastDay, { width: forecastDayWidth }]}>{f.day}</Text>
              <Text style={styles.forecastIcon}>{f.icon}</Text>
              <Text style={styles.forecastCond}>{f.cond}</Text>
              <View style={styles.forecastTemps}>
                <Text style={styles.forecastHigh}>{f.high}</Text>
                <Text style={styles.forecastLow}>{f.low}</Text>
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
              <Text style={styles.extraLabel}>{e.label}</Text>
              <Text style={styles.extraValue}>{e.val}</Text>
            </View>
          ))}
        </View>

        {/* Spacer so content isn't hidden under the absolute-positioned bottom button */}
        <View style={{ height: insets.bottom + 120 }} />
      </ScrollView>

      {/* Coast is Clear button */}
      <View style={[styles.bottomArea, { paddingBottom: insets.bottom + 24 }]}>
        <TouchableOpacity style={styles.clearBtn} onPress={handleCoastIsClear} activeOpacity={0.88}>
          <View style={styles.clearBtnInner}>
            <Text style={styles.waveEmoji}>〰</Text>
            <Text style={styles.clearBtnText}>The Coast is Clear</Text>
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
  bellBtn: { padding: 6, position: 'relative' },
  badge: {
    position: 'absolute',
    top: 1,
    right: 1,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#FF3B30',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: '#07111f',
  },
  badgeText: { color: '#fff', fontSize: 9, fontFamily: 'Inter-Bold', lineHeight: 12 },
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
});
