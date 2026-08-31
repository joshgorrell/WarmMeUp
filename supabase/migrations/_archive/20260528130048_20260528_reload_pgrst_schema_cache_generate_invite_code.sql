/*
  # Reload PostgREST schema cache

  The public.generate_invite_code() function already exists with the correct
  zero-argument signature, uses auth.uid() internally, and returns only
  { invite_code, couple_id }. This migration simply reloads the PostgREST
  schema cache so the API layer picks up the current function definition.
*/

-- Ensure the authenticated role has explicit EXECUTE (belt-and-suspenders alongside
-- the existing PUBLIC grant from prior migrations).
GRANT EXECUTE ON FUNCTION public.generate_invite_code() TO authenticated;

-- Reload PostgREST schema cache.
NOTIFY pgrst, 'reload schema';
