-- Grant UPDATE on date_of_birth, age_verified_at, and onboarding_completed_at
-- to authenticated so the age-verification and onboarding flows can write them.
-- The narrow_column_level_update migration (20260805141500) revoked UPDATE on
-- all profiles columns then re-granted only a subset, omitting these three.

REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (
  display_name,
  avatar_url,
  push_token,
  first_name,
  last_name,
  tos_accepted_at,
  oauth_provider,
  date_of_birth,
  age_verified_at,
  onboarding_completed_at
) ON public.profiles TO authenticated;
