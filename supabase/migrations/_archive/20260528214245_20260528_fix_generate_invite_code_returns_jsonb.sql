/*
  # Fix generate_invite_code() — change return type from json to jsonb

  ## Problem
  PostgREST (used by Supabase) does not expose RPC endpoints for functions
  returning plain `json`. The function must return `jsonb` to be callable
  via the REST API (/rest/v1/rpc/generate_invite_code), otherwise the client
  receives PGRST202 ("Could not find the function").

  ## Changes
  - Drops and recreates public.generate_invite_code() with `returns jsonb`
  - All other logic (security definer, search_path, grant) is preserved

  ## Security
  - SECURITY DEFINER retained so the function runs as the owning role
  - search_path fixed to public
  - EXECUTE granted to authenticated role
*/

-- Drop the existing json-returning variant
DROP FUNCTION IF EXISTS public.generate_invite_code();

-- Recreate with jsonb return type
CREATE OR REPLACE FUNCTION public.generate_invite_code()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_couple_id uuid;
  v_code text;
  v_attempts int := 0;
BEGIN
  -- Find the caller's active couple where they are user_a and no partner yet
  SELECT id INTO v_couple_id
  FROM couples
  WHERE user_a_id = auth.uid()
    AND user_b_id IS NULL
    AND active = true
  LIMIT 1;

  IF v_couple_id IS NULL THEN
    RETURN jsonb_build_object('error', 'no_eligible_couple');
  END IF;

  -- Generate a unique 6-char alphanumeric code
  LOOP
    v_code := upper(substring(replace(gen_random_uuid()::text, '-', '') FROM 1 FOR 6));
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM couples WHERE invite_code = v_code
    );
    v_attempts := v_attempts + 1;
    IF v_attempts > 10 THEN
      RETURN jsonb_build_object('error', 'code_generation_failed');
    END IF;
  END LOOP;

  -- Write the code back to the couple row
  UPDATE couples
  SET invite_code = v_code
  WHERE id = v_couple_id;

  RETURN jsonb_build_object('invite_code', v_code);
END;
$$;

-- Re-grant execute to authenticated
GRANT EXECUTE ON FUNCTION public.generate_invite_code() TO authenticated;

-- Notify PostgREST to reload its schema cache
NOTIFY pgrst, 'reload schema';
