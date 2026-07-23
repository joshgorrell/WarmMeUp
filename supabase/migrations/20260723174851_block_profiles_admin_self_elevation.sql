/*
# Block self-elevation of admin flags on profiles

## Problem

The "Users can update own profile" RLS policy allows any authenticated user
to UPDATE their own profile row with `USING (auth.uid() = id) WITH CHECK
(auth.uid() = id)`. This policy checks *which row* is being updated but not
*which columns*. The `profiles` table has `is_admin` and `is_super_admin`
columns, and there is no trigger or column-level restriction preventing a
user from including those fields in their own PATCH request.

That means any signed-in user could send a direct PATCH to the Supabase REST
API setting their own `is_admin` or `is_super_admin` to `true`. Those flags
gate dozens of "Admins can read all X" policies across `couples`, `profiles`,
`subscriptions`, `scores`, `wishes`, `interactions`, and more — a self-granted
admin flag would let someone read every couple's data, not just their own.

## Fix

Add a `BEFORE UPDATE` trigger on `profiles` that silently reverts
`is_admin` and `is_super_admin` back to their previous (`OLD`) values unless
the acting database user is already a super-admin (checked via the existing
`is_super_admin()` SECURITY DEFINER helper). This is more robust than trying
to enumerate "safe" columns in the RLS policy itself, because it protects the
columns regardless of which policy allowed the update.

## Security Changes

1. New function `protect_profile_admin_flags()` — SECURITY DEFINER, runs
   before every UPDATE on `profiles`. If the acting user is NOT a super-admin,
   `is_admin` and `is_super_admin` are forced back to their `OLD` values.
2. New trigger `protect_profile_admin_flags_trigger` on `profiles` BEFORE
   UPDATE FOR EACH ROW, executing the function above.

## Important Notes

1. Super-admins can still legitimately toggle admin flags — the trigger only
   reverts changes when the acting user is NOT already a super-admin.
2. The `is_super_admin()` function queries `profiles` with SECURITY DEFINER,
   so it sees the pre-update row values during a BEFORE UPDATE trigger (the
   NEW row hasn't been written to the table yet). This means the check is
   based on the user's *current* privileges, not the ones they're trying to
   grant themselves.
3. This migration is idempotent — the function uses `CREATE OR REPLACE` and
   the trigger uses `DROP IF EXISTS` before `CREATE`.
*/

-- 1. Create the protective trigger function
CREATE OR REPLACE FUNCTION public.protect_profile_admin_flags()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- If the acting user is a super-admin, allow any change (including
  -- toggling is_admin / is_super_admin on any row they can update).
  IF is_super_admin() THEN
    RETURN NEW;
  END IF;

  -- Non-super-admin: silently revert admin flags to their previous values.
  -- This blocks self-elevation regardless of which RLS policy allowed the
  -- UPDATE or which columns the client included in the PATCH.
  NEW.is_admin := OLD.is_admin;
  NEW.is_super_admin := OLD.is_super_admin;

  RETURN NEW;
END;
$function$;

-- 2. Attach the trigger
DROP TRIGGER IF EXISTS protect_profile_admin_flags_trigger ON public.profiles;
CREATE TRIGGER protect_profile_admin_flags_trigger
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_admin_flags();