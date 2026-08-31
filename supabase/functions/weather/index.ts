import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// WMO weather interpretation codes → { label, emoji }
function describeCode(code: number): { label: string; emoji: string } {
  if (code === 0) return { label: "Clear Sky", emoji: "☀️" };
  if (code === 1) return { label: "Mostly Clear", emoji: "🌤" };
  if (code === 2) return { label: "Partly Cloudy", emoji: "⛅" };
  if (code === 3) return { label: "Overcast", emoji: "☁️" };
  if (code <= 48) return { label: "Foggy", emoji: "🌫" };
  if (code <= 57) return { label: "Drizzle", emoji: "🌦" };
  if (code <= 67) return { label: "Rain", emoji: "🌧" };
  if (code <= 77) return { label: "Snow", emoji: "❄️" };
  if (code <= 82) return { label: "Rain Showers", emoji: "🌦" };
  if (code <= 86) return { label: "Snow Showers", emoji: "🌨" };
  if (code <= 99) return { label: "Thunderstorm", emoji: "⛈" };
  return { label: "Unknown", emoji: "🌡" };
}

function cToF(c: number): number {
  return Math.round(c * 9 / 5 + 32);
}

function kmToMi(km: number): number {
  return Math.round(km * 0.621371);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const lat = url.searchParams.get("lat");
    const lon = url.searchParams.get("lon");

    if (!lat || !lon) {
      return new Response(JSON.stringify({ error: "lat and lon required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const latNum = parseFloat(lat);
    const lonNum = parseFloat(lon);
    if (
      isNaN(latNum) || isNaN(lonNum) ||
      latNum < -90 || latNum > 90 ||
      lonNum < -180 || lonNum > 180
    ) {
      return new Response(JSON.stringify({ error: "Invalid coordinates" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Open-Meteo: free, no API key required
    const apiUrl =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${latNum}&longitude=${lonNum}` +
      `&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m,uv_index,visibility` +
      `&hourly=temperature_2m,weather_code` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min` +
      `&temperature_unit=celsius` +
      `&wind_speed_unit=mph` +
      `&timezone=auto` +
      `&forecast_days=6` +
      `&forecast_hours=24`;

    // Reverse geocode via Open-Meteo's geocoding companion
    const geoUrl =
      `https://nominatim.openstreetmap.org/reverse?lat=${latNum}&lon=${lonNum}&format=json`;

    const [weatherRes, geoRes] = await Promise.all([
      fetch(apiUrl),
      fetch(geoUrl, { headers: { "User-Agent": "WarmupApp/1.0" } }),
    ]);

    if (!weatherRes.ok) throw new Error("Weather API error");

    const weather = await weatherRes.json();
    const geo = geoRes.ok ? await geoRes.json() : null;

    // Location label: prefer city > town > county > state
    const addr = geo?.address ?? {};
    const city =
      addr.city ?? addr.town ?? addr.village ?? addr.county ?? addr.state ?? "Your Location";
    const state = addr.state_code ?? addr.country_code?.toUpperCase() ?? "";
    const locationLabel = state ? `${city}, ${state}` : city;

    // Current conditions
    const cur = weather.current;
    const curDesc = describeCode(cur.weather_code);
    const currentTemp = cToF(cur.temperature_2m);
    const humidity = Math.round(cur.relative_humidity_2m);
    const uvIndex = Math.round(cur.uv_index ?? 0);
    const visibilityMi = cur.visibility != null ? kmToMi(cur.visibility / 1000) : null;

    // Today hi/lo from daily index 0
    const todayHigh = cToF(weather.daily.temperature_2m_max[0]);
    const todayLow = cToF(weather.daily.temperature_2m_min[0]);

    // Hourly — next 8 hours from current hour
    const now = new Date();
    const currentHour = now.getHours();
    const hourlyTimes: string[] = weather.hourly.time; // ISO strings
    const startIdx = hourlyTimes.findIndex((t: string) => {
      const h = new Date(t).getHours();
      return h >= currentHour;
    });
    const slice = startIdx >= 0 ? startIdx : 0;
    const hourly = [];
    for (let i = 0; i < 8; i++) {
      const idx = slice + i;
      if (idx >= hourlyTimes.length) break;
      const d = new Date(hourlyTimes[idx]);
      const h = d.getHours();
      const label =
        i === 0
          ? "Now"
          : h === 0
          ? "12AM"
          : h < 12
          ? `${h}AM`
          : h === 12
          ? "12PM"
          : `${h - 12}PM`;
      const desc = describeCode(weather.hourly.weather_code[idx]);
      hourly.push({
        time: label,
        temp: `${cToF(weather.hourly.temperature_2m[idx])}°`,
        icon: desc.emoji,
      });
    }

    // 5-day forecast (skip today = index 0, use 1-5)
    const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const forecast = [];
    for (let i = 1; i <= 5; i++) {
      if (i >= weather.daily.weather_code.length) break;
      const d = new Date(weather.daily.time[i]);
      const desc = describeCode(weather.daily.weather_code[i]);
      forecast.push({
        day: DAY_NAMES[d.getDay()],
        cond: desc.label,
        high: `${cToF(weather.daily.temperature_2m_max[i])}°`,
        low: `${cToF(weather.daily.temperature_2m_min[i])}°`,
        icon: desc.emoji,
      });
    }

    const payload = {
      location: locationLabel,
      currentTemp: `${currentTemp}°`,
      condition: curDesc.label,
      hiLo: `H: ${todayHigh}°  L: ${todayLow}°`,
      humidity: `${humidity}%`,
      uvIndex: `${uvIndex}`,
      visibility: visibilityMi != null ? `${visibilityMi} mi` : "—",
      hourly,
      forecast,
    };

    return new Response(JSON.stringify(payload), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch {
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
