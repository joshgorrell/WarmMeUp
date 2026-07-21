/*
  # Fix celebration_seen and onboarding_seen flags for existing paired users

  ## Summary
  Josh (user_a in the couple) has celebration_seen=false and onboarding_seen=false
  because he was the original account holder before pairing existed. He should never
  see the celebration or onboarding screens again — those are first-time-pair flows.

  ## Changes
  - Sets celebration_seen=true and onboarding_seen=true for Josh
  - Safe no-op for Robyn who already has both flags set to true
*/

UPDATE public.user_settings
SET
  celebration_seen = true,
  onboarding_seen = true,
  updated_at = now()
WHERE user_id = 'aa307a0e-9cd4-4b56-838c-ad5c848014ac'
  AND (celebration_seen = false OR onboarding_seen = false);
