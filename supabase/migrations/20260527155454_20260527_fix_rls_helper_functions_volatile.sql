/*
  # Fix RLS helper function volatility

  ## Problem
  Both `is_current_user_admin()` and `is_super_admin()` were marked STABLE.
  In PostgreSQL, STABLE functions can be cached within a statement execution.
  When used inside RLS policies, this causes the result to be cached before
  auth.uid() is fully propagated into the session context, making the functions
  return false for legitimate admin users — silently blocking all admin queries.

  ## Changes
  - `is_current_user_admin()`: STABLE -> VOLATILE
  - `is_super_admin()`: STABLE -> VOLATILE

  These functions read from profiles using auth.uid() which can change between
  calls (e.g. different sessions, RLS re-evaluation). VOLATILE ensures Postgres
  re-evaluates them on every call rather than caching the result.

  ## Affected tables
  All tables whose admin RLS policies call these functions:
  - profiles (Admins can read all profiles)
  - couples (Admins can read all couples, Admins can update any couple)
  - subscriptions (Admins can read all subscriptions)
  - wishes (Admins can read all wishes)
  - admin_grants (Admins can read all admin grants)
*/

CREATE OR REPLACE FUNCTION public.is_current_user_admin()
  RETURNS boolean
  LANGUAGE sql
  VOLATILE
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (SELECT is_admin FROM public.profiles WHERE id = auth.uid()),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
  RETURNS boolean
  LANGUAGE sql
  VOLATILE
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (SELECT is_super_admin FROM public.profiles WHERE id = auth.uid()),
    false
  );
$$;
