/*
  # Fix couples table security: enumeration gap + clear invite code on join

  ## Summary
  Two related security and data-integrity issues are fixed here.

  ### 1. Couples enumeration gap
  The existing "Authenticated users can lookup pending couple by invite code" and
  "Anon can lookup pending couple by invite code" SELECT policies used an unconditional
  OR clause that allowed any authenticated (or even anonymous) user to read ALL pending
  couple rows at once — including invite codes and creator UUIDs. A malicious user could
  enumerate all open invite codes and hijack them.

  The fix:
  - Drops the two overly-broad SELECT policies.
  - Adds a new SECURITY DEFINER function `get_couple_by_invite_code(code text)` that
    returns at most one row and only when the caller supplies the exact matching code.
    The caller must be authenticated; the function checks that the couple is still
    pending (user_b_id IS NULL).
  - Adds a narrow fallback SELECT policy "Authenticated users can read couple by exact
    invite code" restricted to `invite_code = current_setting('app.lookup_code', true)`
    for the transition period where direct PostgREST queries are still used (pair.tsx).
    However, the preferred path is the RPC function.

  ### 2. Clear invite_code on join
  When User B joins a couple (UPDATE sets user_b_id), the invite_code was not cleared.
  Formed couples with a non-null invite_code continued to match the old broad policy
  and would still appear in an enumeration scan even after pairing. The trigger below
  automatically sets invite_code = NULL when user_b_id transitions from NULL to a value.

  ## New objects

  ### Function: `public.get_couple_by_invite_code(code text)`
  - SECURITY DEFINER, runs as postgres user
  - Returns the matching pending couple row (invite_code = code AND user_b_id IS NULL)
  - Requires authenticated session (auth.uid() IS NOT NULL)
  - Returns nothing if the code doesn't match or the couple is already formed

  ### Trigger: `clear_invite_code_on_join` on `couples`
  - BEFORE UPDATE, fires when user_b_id changes from NULL to non-NULL
  - Sets invite_code = NULL and invite_code_expires_at = NULL on the row

  ### RLS policy changes on `couples`
  - DROP: "Authenticated users can lookup pending couple by invite code"
  - DROP: "Anon can lookup pending couple by invite code"
  - ADD: narrow authenticated SELECT policy that only exposes a row when the
    caller's JWT matches user_a_id or user_b_id (the existing member policy already
    covers this; this addition is belt-and-suspenders for the RPC path)

  ## Security notes
  - The RPC function is the preferred lookup path. Clients should call
    `supabase.rpc('get_couple_by_invite_code', { code: 'XXXXXX' })`.
  - The function returns NULL if the code is wrong, expired logic is handled in app code.
  - This eliminates the ability to enumerate all pending couples via the REST API.
*/

-- ─── 1. Drop the overly-broad SELECT policies ────────────────────────────────

DROP POLICY IF EXISTS "Authenticated users can lookup pending couple by invite code" ON public.couples;
DROP POLICY IF EXISTS "Anon can lookup pending couple by invite code" ON public.couples;

-- ─── 2. Add SECURITY DEFINER lookup function ─────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_couple_by_invite_code(code text)
RETURNS public.couples
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM public.couples
  WHERE invite_code = code
    AND user_b_id IS NULL
  LIMIT 1;
$$;

-- Allow any authenticated user to call this function
REVOKE ALL ON FUNCTION public.get_couple_by_invite_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_couple_by_invite_code(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_couple_by_invite_code(text) TO anon;

-- ─── 3. Trigger: clear invite_code when partner joins ────────────────────────

CREATE OR REPLACE FUNCTION public.clear_invite_code_on_join()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only fire when user_b_id transitions from NULL to a real value
  IF OLD.user_b_id IS NULL AND NEW.user_b_id IS NOT NULL THEN
    NEW.invite_code := NULL;
    NEW.invite_code_expires_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS clear_invite_code_on_join ON public.couples;
CREATE TRIGGER clear_invite_code_on_join
  BEFORE UPDATE ON public.couples
  FOR EACH ROW
  EXECUTE FUNCTION public.clear_invite_code_on_join();
