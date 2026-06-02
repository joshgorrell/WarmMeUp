/*
  # Fix handle_new_user trigger — inline invite code generation

  ## Problem
  The trigger `on_auth_user_created` calls `public.generate_invite_code()` which
  internally calls `auth.uid()` and raises 'Not authenticated' when it is NULL.
  During a trigger on `auth.users INSERT`, `auth.uid()` is always NULL because
  the session does not exist yet — the user row is still being inserted.
  This caused every email/password (and OAuth) registration to fail with
  "Database error saving new user".

  ## Fix
  Rewrite `handle_new_user` to generate the invite code inline using `NEW.id`
  directly, with the same 26-char safe alphabet and collision-retry loop.
  The `generate_invite_code()` RPC is NOT called from this trigger anymore.

  ## Changes
  - `public.handle_new_user()` — replaced `public.generate_invite_code()` call
    with an inline code generation block that uses `NEW.id` (not `auth.uid()`)
*/

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_display_name text;
  v_provider     text;
  v_code         text;
  v_alphabet     text := 'ACDEFGHJKLMNPQRTUVWXY34679';
  v_attempts     int  := 0;
  i              int;
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

  -- Generate a unique 6-char invite code inline (no auth.uid() dependency)
  LOOP
    v_code := '';
    FOR i IN 1..6 LOOP
      v_code := v_code || substr(v_alphabet, floor(random() * length(v_alphabet))::int + 1, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.couples WHERE invite_code = v_code);
    v_attempts := v_attempts + 1;
    IF v_attempts > 20 THEN
      RAISE EXCEPTION 'Could not generate unique invite code after 20 attempts' USING ERRCODE = 'P0002';
    END IF;
  END LOOP;

  -- Insert solo couple row with active = true so the user has full app access
  -- immediately. Partner presence is tracked via user_b_id, not active flag.
  INSERT INTO public.couples (user_a_id, invite_code, active)
  VALUES (NEW.id, v_code, true)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;
