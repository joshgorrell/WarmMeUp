/*
  # Drop stale couples_user_a_inactive_unique index

  ## Summary
  Migration 20260520_harden_invite_code_flow created a partial unique index
  `couples_user_a_inactive_unique` that enforces uniqueness on user_a_id WHERE
  active = false. This was designed for the old rule where active = false meant
  "pending invite".

  Migration 20260520_fix_couple_active_default_and_patch_solo_users reversed that
  rule — active = true is now the correct state for both solo/pending AND paired couples.
  Active = false only exists for archived/historical rows after a disconnect.

  The stale index now serves no purpose, wastes storage, and could block valid
  operations if a user has an old inactive row alongside their current active row.

  ## Changes
  - DROP partial unique index `couples_user_a_inactive_unique`

  ## Notes
  The meaningful uniqueness constraint is `couples_user_b_active_unique` (user_b_id
  WHERE active = true AND user_b_id IS NOT NULL), which remains in place and correctly
  prevents a user from joining two couples simultaneously.
*/

DROP INDEX IF EXISTS public.couples_user_a_inactive_unique;
