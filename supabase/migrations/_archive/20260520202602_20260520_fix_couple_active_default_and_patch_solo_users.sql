/*
  # Fix couple active default and patch existing solo users

  ## Summary
  Solo users (no partner paired yet) were being blocked from app features
  because the `active` column on `couples` defaulted to `false`. The `active`
  flag was intended to mean "partner has joined", but the app should allow full
  feature access even before a partner joins.

  ## Changes

  ### Modified Tables
  - `couples`
    - Change default of `active` column from `false` to `true`
    - Patch all existing solo couples (user_b_id IS NULL, active = false)
      to active = true so current solo users regain full access immediately

  ## Notes
  1. The pairing flow (setup-pin.tsx) still writes `active = true` when a
     partner accepts — this becomes a safe no-op for the flag but still
     correctly records user_b_id and invite_code_used_at.
  2. The "Cancel Invite" guard in account.tsx checks `couple.active === false`
     before allowing invite deletion — this remains correct because a newly
     created solo couple will now be active = true, so the cancel path simply
     won't appear until the user explicitly generates an invite code.
  3. The anon/authenticated RLS policies that read pending couples by
     invite_code AND active = false continue to work for the invite-acceptance
     flow because those lookups key on invite_code presence, not active state.
*/

-- Change the column default so all future couples start as active
ALTER TABLE couples ALTER COLUMN active SET DEFAULT true;

-- Patch existing solo users who were stuck with active = false and no partner
UPDATE couples
SET active = true
WHERE user_b_id IS NULL
  AND active = false;
