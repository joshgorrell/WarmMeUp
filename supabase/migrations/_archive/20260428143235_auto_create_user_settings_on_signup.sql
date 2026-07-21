/*
  # Auto-create user_settings row on signup

  1. Changes
    - Creates a Postgres function `handle_new_user_settings` that inserts a
      default user_settings row whenever a new auth.users record is created
    - Attaches that function as an AFTER INSERT trigger on auth.users
    - Backfills a default user_settings row for every existing user who doesn't
      already have one (covers Josh and any other pre-existing accounts)

  2. Notes
    - All boolean columns use their existing DB defaults, so we only need to
      supply user_id; everything else defaults correctly
    - The trigger runs with SECURITY DEFINER so it can bypass RLS when writing
      the initial row
    - Backfill uses INSERT ... ON CONFLICT DO NOTHING to be safe
*/

-- Function that inserts default settings for a new user
CREATE OR REPLACE FUNCTION public.handle_new_user_settings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_settings (user_id)
  VALUES (NEW.id)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

-- Trigger on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created_settings ON auth.users;
CREATE TRIGGER on_auth_user_created_settings
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_settings();

-- Backfill for all existing users who have no settings row
INSERT INTO public.user_settings (user_id)
SELECT id FROM auth.users
WHERE id NOT IN (SELECT user_id FROM public.user_settings)
ON CONFLICT DO NOTHING;
