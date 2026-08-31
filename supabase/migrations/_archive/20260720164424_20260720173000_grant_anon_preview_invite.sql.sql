/*
  # Grant anon access to preview_invite

  The pre-auth pairing flow needs to show the inviter's name to User B
  before they create an account. At that point User B is not authenticated,
  so preview_invite must be callable by anon.

  This is safe because:
  - The invite code is a 6-character shared secret already exchanged
    between the couple out-of-band.
  - The existing get_couple_by_invite_code RPC is already anon-accessible.
  - preview_invite only returns display_name and avatar_url — no emails,
    no user IDs, no other PII.
  - Brute-force protection is handled by request_join's rate limiter; the
    preview does not create state.
*/

GRANT EXECUTE ON FUNCTION public.preview_invite(text) TO anon;

NOTIFY pgrst, 'reload schema';
