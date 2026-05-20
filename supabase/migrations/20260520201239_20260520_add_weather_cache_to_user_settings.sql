/*
  # Add Weather Location Cache to User Settings

  ## Summary
  Adds two nullable float columns to user_settings so the app can cache the
  user's last known GPS coordinates. On the next app open the weather screen
  can immediately fetch weather for the cached location instead of showing
  the San Diego fallback while GPS warms up.

  ## Changes

  ### Modified Tables
  - `user_settings`
    - `weather_lat` (float8, nullable, default null) — last known latitude
    - `weather_lon` (float8, nullable, default null) — last known longitude

  ## Notes
  1. Both columns are nullable — existing rows stay unchanged.
  2. No RLS changes required; existing per-user select/update policies cover these columns.
  3. Values are written after every successful live GPS fetch from weather.tsx / useWeather.ts.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_settings' AND column_name = 'weather_lat'
  ) THEN
    ALTER TABLE user_settings ADD COLUMN weather_lat float8 DEFAULT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_settings' AND column_name = 'weather_lon'
  ) THEN
    ALTER TABLE user_settings ADD COLUMN weather_lon float8 DEFAULT NULL;
  END IF;
END $$;
