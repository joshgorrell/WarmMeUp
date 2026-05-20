import { useState, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

// Module-level runtime cache shared across all hook instances in a session
let sessionCachedTemp: string | null = null;

async function fetchTempForCoords(lat: number, lon: number): Promise<string> {
  const res = await fetch(
    `${SUPABASE_URL}/functions/v1/weather?lat=${lat}&lon=${lon}`,
    { headers: { Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
  );
  if (!res.ok) throw new Error('Weather fetch failed');
  const data = await res.json();
  return data?.currentTemp ?? '';
}

async function cacheCoords(userId: string, lat: number, lon: number) {
  await supabase
    .from('user_settings')
    .update({ weather_lat: lat, weather_lon: lon, updated_at: new Date().toISOString() })
    .eq('user_id', userId);
}

export function useWeather(
  cachedLat?: number | null,
  cachedLon?: number | null,
  userId?: string,
): string {
  const [temp, setTemp] = useState<string>(sessionCachedTemp ?? '');
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;

    (async () => {
      // Step 1: If session already resolved a temp this run, use it immediately.
      if (sessionCachedTemp) {
        setTemp(sessionCachedTemp);
      } else if (cachedLat != null && cachedLon != null) {
        // Step 2: Use DB-cached coords for instant display while GPS warms up.
        try {
          const t = await fetchTempForCoords(cachedLat, cachedLon);
          if (mounted.current && !sessionCachedTemp) setTemp(t);
        } catch { /* fall through to live GPS */ }
      }

      // Step 3: Get a fresh live GPS fix.
      try {
        let lat: number, lon: number;

        if (Platform.OS === 'web') {
          if (!navigator?.geolocation) return;
          const pos = await new Promise<GeolocationPosition>((res, rej) =>
            navigator.geolocation.getCurrentPosition(res, rej, { timeout: 6000 })
          );
          lat = pos.coords.latitude;
          lon = pos.coords.longitude;
        } else {
          const Location = await import('expo-location');
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status !== 'granted') return;
          const pos = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          lat = pos.coords.latitude;
          lon = pos.coords.longitude;
        }

        const t = await fetchTempForCoords(lat, lon);
        sessionCachedTemp = t;
        if (mounted.current) setTemp(t);

        if (userId) cacheCoords(userId, lat, lon);
      } catch { /* silently keep whatever we have */ }
    })();

    return () => { mounted.current = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return temp;
}
