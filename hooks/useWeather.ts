import { useState, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

// Module-level runtime cache shared across all hook instances in a session
let sessionCachedTemp: string | null = null;

export function clearWeatherSessionCache() {
  sessionCachedTemp = null;
}

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
  const resolvedRef = useRef(false);

  useEffect(() => {
    mounted.current = true;

    // Already have a session-level temp — apply immediately and skip all fetches.
    if (sessionCachedTemp) {
      setTemp(sessionCachedTemp);
      return;
    }

    (async () => {
      // Step 1: Use DB-cached coords for instant display.
      // Cache the result in sessionCachedTemp right away so all other hook
      // instances (BrandHeader, TabHeader) get it immediately on their next render.
      if (cachedLat != null && cachedLon != null && !resolvedRef.current) {
        try {
          const t = await fetchTempForCoords(cachedLat, cachedLon);
          if (t) {
            sessionCachedTemp = t;
            resolvedRef.current = true;
            if (mounted.current) setTemp(t);
          }
        } catch (e) {
          console.warn('[useWeather] cached coords fetch failed:', e);
        }
      }

      // Step 2: Get a fresh live GPS fix to update with current location.
      try {
        let lat: number, lon: number;
        let gpsDenied = false;

        if (Platform.OS === 'web') {
          if (!navigator?.geolocation) {
            gpsDenied = true;
          } else {
            try {
              const pos = await new Promise<GeolocationPosition>((res, rej) =>
                navigator.geolocation.getCurrentPosition(res, rej, { timeout: 6000 })
              );
              lat = pos.coords.latitude;
              lon = pos.coords.longitude;
            } catch {
              gpsDenied = true;
            }
          }
        } else {
          const Location = await import('expo-location');
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status !== 'granted') {
            gpsDenied = true;
          } else {
            const pos = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Balanced,
            });
            lat = pos.coords.latitude;
            lon = pos.coords.longitude;
          }
        }

        if (gpsDenied) return;

        const t = await fetchTempForCoords(lat!, lon!);
        if (t) {
          sessionCachedTemp = t;
          resolvedRef.current = true;
          if (mounted.current) setTemp(t);
        }

        if (userId) cacheCoords(userId, lat!, lon!);
      } catch (e) {
        console.warn('[useWeather] GPS fetch failed:', e);
      }
    })();

    return () => { mounted.current = false; };
  // Re-run once cached coords arrive from settings (settings load async after mount)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cachedLat, cachedLon]);

  return temp;
}
