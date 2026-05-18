import { useState, useEffect, useRef } from 'react';
import { Platform } from 'react-native';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

// Module-level cache so all hook instances share a single fetch
let cachedTemp: string | null = null;
let fetchPromise: Promise<string> | null = null;

async function resolveTemp(): Promise<string> {
  if (cachedTemp) return cachedTemp;
  if (fetchPromise) return fetchPromise;

  fetchPromise = (async () => {
    try {
      let lat: number, lon: number;
      if (Platform.OS === 'web') {
        if (!navigator?.geolocation) return '72°';
        const pos = await new Promise<GeolocationPosition>((res, rej) =>
          navigator.geolocation.getCurrentPosition(res, rej, { timeout: 6000 })
        );
        lat = pos.coords.latitude;
        lon = pos.coords.longitude;
      } else {
        const Location = await import('expo-location');
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return '72°';
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        lat = pos.coords.latitude;
        lon = pos.coords.longitude;
      }

      const res = await fetch(
        `${SUPABASE_URL}/functions/v1/weather?lat=${lat}&lon=${lon}`,
        { headers: { Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
      );
      if (!res.ok) return '72°';
      const data = await res.json();
      const temp: string = data?.currentTemp ?? '72°';
      cachedTemp = temp;
      return temp;
    } catch {
      return '72°';
    }
  })();

  return fetchPromise;
}

export function useWeather(): string {
  const [temp, setTemp] = useState<string>(cachedTemp ?? '');
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    if (cachedTemp) { setTemp(cachedTemp); return; }
    resolveTemp().then((t) => { if (mounted.current) setTemp(t); });
    return () => { mounted.current = false; };
  }, []);

  return temp;
}
