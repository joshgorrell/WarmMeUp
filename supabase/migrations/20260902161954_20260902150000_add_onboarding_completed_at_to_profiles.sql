/*
# Add onboarding_completed_at to profiles

## Purpose
Tracks whether a user has completed the onboarding flow. This fixes a bug where
OAuth (Apple/Google) users skip onboarding because `handle_new_user` creates a
profile row immediately on signup, causing the existing profile-existence check
in login.tsx to treat them as returning users.

## Changes
1. Adds `onboarding_completed_at timestamptz` (nullable) to `profiles`.
2. Backfills existing profiles:
   - Profiles with `tos_accepted_at` populated AND a non-empty `display_name`
     are treated as having completed onboarding (set to `created_at`).
   - All other profiles remain null, forcing them through onboarding on next launch.

## Security
- No RLS policy changes — `profiles` already has owner-scoped SELECT/UPDATE policies.
- The new column is writable by the owning user through existing UPDATE policies.

## Important Notes
1. The client reads `onboarding_completed_at` from the profile to decide routing
   after OAuth sign-in. If null, the user is sent to onboarding; if set, to the app.
2. The onboarding flow sets this column to `now()` upon completion.
3. The global router (index.tsx) also checks this column to redirect users who
   somehow land in the app without completing onboarding (e.g. app restart mid-flow).
*/

-- Add the column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'onboarding_completed_at'
  ) THEN
    ALTER TABLE profiles ADD COLUMN onboarding_completed_at timestamptz;
  END IF;
END $$;

-- Backfill: profiles that have accepted TOS and have a display name are
-- considered to have completed onboarding. Use created_at as the timestamp.
UPDATE profiles
SET onboarding_completed_at = created_at
WHERE onboarding_completed_at IS NULL
  AND tos_accepted_at IS NOT NULL
  AND display_name IS NOT NULL
  AND display_name <> '';
