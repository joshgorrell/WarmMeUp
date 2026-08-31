/*
  # Pin search_path on get_day_streak

  1. Problem
     - `public.get_day_streak(uuid, text)` has a mutable search_path (proconfig is null),
       so unqualified references inside it resolve against the caller's search_path.

  2. Change
     - `ALTER FUNCTION ... SET search_path = public, pg_temp` so resolution is fixed.
*/

ALTER FUNCTION public.get_day_streak(uuid, text) SET search_path = public, pg_temp;
