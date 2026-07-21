/*
  # Fix handle_new_user() trigger: solo couple created with active = true

  ## Summary
  Migration 20260520202602 changed the `couples.active` column default to `true`
  so that solo users (no partner yet) have full app access immediately. However,
  the `handle_new_user()` trigger function still explicitly inserts `active = false`,
  bypassing the column default. Every new user since that migration has received a
  solo couple with `active = false`, which causes `transition.tsx` to route them to
  the pair screen instead of the main app — making the app completely inaccessible
  without a partner.

  ## Changes

  ### Modified Functions
  - `handle_new_user()` — changed solo couple INSERT from `active = false` to `active = true`

  ## Notes
  1. The `active` flag no longer means "partner has joined" — it means "couple exists
     and is active". Partner presence is now determined by `user_b_id IS NOT NULL`.
  2. The transition.tsx routing check `couple?.active` therefore works correctly:
     solo users (active=true, user_b_id=null) enter the main app; they can pair
     later from the account screen.
  3. Existing rows are already correct (patched by migration 20260520202602).
*/

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_display_name text;
  v_provider     text;
  v_code         text;
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
  VALUES (NEW.id, v_display_name, v_provider)
  ON CONFLICT (id) DO UPDATE
    SET oauth_provider = EXCLUDED.oauth_provider
    WHERE public.profiles.oauth_provider IS NULL;

  -- Insert user_settings row (no-op if already exists)
  INSERT INTO public.user_settings (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  -- Generate a unique invite code (retry on collision)
  LOOP
    v_code := public.generate_invite_code();
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.couples WHERE invite_code = v_code);
  END LOOP;

  -- Insert solo couple row with active = true so the user has full app access
  -- immediately. Partner presence is tracked via user_b_id, not active flag.
  INSERT INTO public.couples (user_a_id, invite_code, active)
  VALUES (NEW.id, v_code, true)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;
