
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
  v_display_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    split_part(NEW.email, '@', 1),
    'Warm Me Up user'
  );

  SELECT provider INTO v_provider
  FROM auth.identities
  WHERE user_id = NEW.id
    AND provider <> 'email'
  ORDER BY created_at
  LIMIT 1;

  INSERT INTO public.profiles (id, display_name, oauth_provider)
  VALUES (
    NEW.id,
    v_display_name,
    v_provider
  )
  ON CONFLICT (id) DO UPDATE
    SET oauth_provider = EXCLUDED.oauth_provider
    WHERE public.profiles.oauth_provider IS NULL;

  INSERT INTO public.user_settings (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
