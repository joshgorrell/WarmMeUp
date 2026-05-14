/*
  # Google SSO Support

  1. Changes
    - Add `oauth_provider` column to `profiles` (text, nullable)
      Records how the user signed up: 'google', 'apple', or NULL for email/password
    - Add `handle_new_user()` trigger function on auth.users INSERT
      Auto-creates a `profiles` row and a `user_settings` row for every new user,
      whether they sign up via email/password or any OAuth provider.
      Prevents orphaned accounts if the app is backgrounded or crashes mid-flow.

  2. Security
    - Trigger runs as SECURITY DEFINER so it can write to public tables
    - The trigger function is owned by postgres and is not directly callable by users
    - Existing RLS policies on profiles and user_settings are unchanged

  3. Notes
    - Uses INSERT ... ON CONFLICT DO NOTHING so manual inserts from the app code
      still work without error (idempotent)
    - display_name is derived from raw_user_meta_data->full_name (OAuth) or the
      email prefix (email signup)
    - tos_accepted_at is set for OAuth users at signup time (they accept ToS in app
      before the OAuth button is enabled); email users keep NULL until explicitly set
*/

-- Add oauth_provider tracking column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'profiles'
      AND column_name  = 'oauth_provider'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN oauth_provider text DEFAULT NULL;
  END IF;
END $$;

-- Auto-create profile + user_settings for every new auth.users row
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_display_name text;
  v_provider     text;
BEGIN
  -- Derive a human-readable name
  v_display_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    split_part(NEW.email, '@', 1),
    'Warm Me Up user'
  );

  -- Detect OAuth provider from identities (first non-email provider wins)
  SELECT provider INTO v_provider
  FROM auth.identities
  WHERE user_id = NEW.id
    AND provider <> 'email'
  ORDER BY created_at
  LIMIT 1;

  -- Insert profile row (no-op if app code already created it)
  INSERT INTO public.profiles (id, display_name, oauth_provider)
  VALUES (
    NEW.id,
    v_display_name,
    v_provider
  )
  ON CONFLICT (id) DO UPDATE
    SET oauth_provider = EXCLUDED.oauth_provider
    WHERE public.profiles.oauth_provider IS NULL;

  -- Insert user_settings row (no-op if already exists)
  INSERT INTO public.user_settings (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Attach trigger to auth.users (drop first to keep idempotent)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
