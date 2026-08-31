/*
  # Add first_name and last_name to profiles

  ## Summary
  Adds separate first_name and last_name columns to the profiles table to
  support a more personal greeting experience. The existing display_name column
  is preserved as a full-name convenience field kept in sync.

  ## Changes

  ### profiles table
  - New column `first_name` (text, NOT NULL, default '') — given name, max 20 chars enforced by app
  - New column `last_name` (text, NOT NULL, default '') — family name, max 30 chars enforced by app
  - Data migration: derives first_name/last_name from existing display_name for all current rows
  - display_name remains intact and in sync

  ### handle_new_user trigger
  - Updated to derive and write first_name + last_name for new signups alongside display_name

  ## Notes
  - display_name is NOT removed — all existing code that reads it continues to work
  - first_name/last_name are additive; used by greeting and new name-edit UI
  - Migration uses split_part to safely handle single-word names (last_name stays '')
*/

-- 1. Add new columns (safe to re-run)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS first_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS last_name  text NOT NULL DEFAULT '';

-- 2. Migrate existing rows: derive first/last from display_name
--    split_part('Josh', ' ', 1)         => 'Josh' / ''
--    split_part('Samantha Jones', ' ', 1)=> 'Samantha' / 'Jones'
--    trim handles multi-space gaps safely
UPDATE public.profiles
SET
  first_name = TRIM(split_part(display_name, ' ', 1)),
  last_name  = TRIM(CASE
    WHEN strpos(display_name, ' ') > 0
    THEN substr(display_name, strpos(display_name, ' ') + 1)
    ELSE ''
  END)
WHERE first_name = '' OR last_name = '';

-- 3. Replace handle_new_user to also write first_name + last_name
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_display_name text;
  v_first_name   text;
  v_last_name    text;
  v_provider     text;
  v_code         text;
  v_alphabet     text := 'ACDEFGHJKLMNPQRTUVWXY34679';
  v_attempts     int  := 0;
  i              int;
BEGIN
  -- Derive a human-readable name from OAuth metadata or email prefix
  v_display_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    split_part(NEW.email, '@', 1),
    'Warm Me Up user'
  );

  -- Split display name into first / last
  v_first_name := TRIM(split_part(v_display_name, ' ', 1));
  v_last_name  := TRIM(CASE
    WHEN strpos(v_display_name, ' ') > 0
    THEN substr(v_display_name, strpos(v_display_name, ' ') + 1)
    ELSE ''
  END);

  -- Detect OAuth provider from identities (first non-email provider wins)
  SELECT provider INTO v_provider
  FROM auth.identities
  WHERE user_id = NEW.id
    AND provider <> 'email'
  ORDER BY created_at
  LIMIT 1;

  -- Insert profile row (no-op if app code already created it)
  INSERT INTO public.profiles (id, display_name, first_name, last_name, oauth_provider)
  VALUES (NEW.id, v_display_name, v_first_name, v_last_name, v_provider)
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
