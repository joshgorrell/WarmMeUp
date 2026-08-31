/*
  # Remove client access to get_couple_by_invite_code

  1. Problem
     - `get_couple_by_invite_code(code text)` is SECURITY DEFINER and executable by `anon`,
       and it returns `id`, `user_a_id`, `user_b_id`, `subscription_owner_id` and the raw
       `invite_code` for any couple whose invite code the caller guesses.

  2. Change
     - Revoke EXECUTE from PUBLIC, `anon` and `authenticated`. The function stays available
       to `postgres` / `service_role` for server-side use.

  3. Notes
     - No client code calls it. The pairing screen uses `preview_invite()`, which returns
       only a display name and avatar.
*/

REVOKE ALL ON FUNCTION public.get_couple_by_invite_code(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_couple_by_invite_code(text) FROM anon;
REVOKE ALL ON FUNCTION public.get_couple_by_invite_code(text) FROM authenticated;
