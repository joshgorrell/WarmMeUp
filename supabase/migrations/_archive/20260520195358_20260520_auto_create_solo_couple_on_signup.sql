/*
  # Auto-create solo couple record on sign-up

  ## Summary
  Every user now gets a `couples` row automatically the moment they sign up,
  so the entire app works in solo mode (no partner) from day one. When they
  eventually pair with a partner the existing couple row is updated — no
  duplicate rows are created.

  ## Changes

  ### 1. `handle_new_user()` trigger extended
  - The existing trigger (on_auth_user_created) already creates `profiles` and
    `user_settings` rows on INSERT into auth.users.
  - We extend it to also INSERT a `couples` row with:
      user_a_id = NEW.id
      user_b_id = NULL  (solo — no partner yet)
      active    = false (becomes true when partner joins)
      invite_code = 6-char random code drawn from the same safe alphabet used
                    by the app (ACDEFGHJKLMNPQRTUVWXY34679)
  - Uses ON CONFLICT DO NOTHING so it is idempotent.

  ### 2. Back-fill for existing users
  - Any auth.users row that already has a `profiles` entry but no `couples`
    row (e.g. the current test user) gets a solo couple created right now.

  ## Security
  - Trigger runs SECURITY DEFINER — no RLS bypass needed for app code.
  - Existing couple INSERT policy ("User can create couple as user_a") remains
    valid; the trigger-created row satisfies it retroactively.
  - No RLS policy changes required — all existing policies already work when
    user_b_id is NULL and active is false.

  ## Notes
  - invite_code_expires_at is intentionally NULL for trigger-created rows;
    the app regenerates it on the Pair screen if/when the user shares a code.
  - The back-fill uses a DO block with a cursor so it handles any number of
    existing users safely.
*/

-- ─── Helper: generate a random 6-char invite code in pure SQL ────────────────
-- Uses the same alphabet as the app: ACDEFGHJKLMNPQRTUVWXY34679
CREATE OR REPLACE FUNCTION public.generate_invite_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_alphabet text := 'ACDEFGHJKLMNPQRTUVWXY34679';
  v_code     text := '';
  v_i        int;
BEGIN
  FOR v_i IN 1..6 LOOP
    v_code := v_code || substr(v_alphabet, floor(random() * length(v_alphabet))::int + 1, 1);
  END LOOP;
  RETURN v_code;
END;
$$;

-- ─── Extended handle_new_user trigger ────────────────────────────────────────
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

  -- Insert solo couple row (no-op if user already has one as user_a_id)
  INSERT INTO public.couples (user_a_id, invite_code, active)
  VALUES (NEW.id, v_code, false)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

-- Re-attach trigger (idempotent — drop first)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ─── Back-fill: create solo couples for existing users with no couple ─────────
DO $$
DECLARE
  v_user_id uuid;
  v_code    text;
BEGIN
  FOR v_user_id IN
    SELECT u.id
    FROM auth.users u
    WHERE NOT EXISTS (
      SELECT 1 FROM public.couples c
      WHERE c.user_a_id = u.id OR c.user_b_id = u.id
    )
  LOOP
    -- Generate a unique invite code
    LOOP
      v_code := public.generate_invite_code();
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.couples WHERE invite_code = v_code);
    END LOOP;

    INSERT INTO public.couples (user_a_id, invite_code, active)
    VALUES (v_user_id, v_code, false)
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;
