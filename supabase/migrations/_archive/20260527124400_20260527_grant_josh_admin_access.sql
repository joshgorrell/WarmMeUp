/*
  # Grant Josh admin access (idempotent)

  ## Summary
  Ensures Josh (josh@ksav.com, UUID aa307a0e-9cd4-4b56-838c-ad5c848014ac) has:
  1. is_admin = true and is_super_admin = true on his profiles row
  2. An active admin_grant with entitlement_type = 'free_access' and no expiry

  The admin_grant INSERT is skipped if he already has an active grant (unique index
  on user_id WHERE active = true prevents duplicates).

  This gives him isPremium = true, canInvite = true via the get-effective-subscription
  edge function without touching any auth credentials.
*/

UPDATE profiles
SET
  is_admin = true,
  is_super_admin = true
WHERE id = 'aa307a0e-9cd4-4b56-838c-ad5c848014ac';

INSERT INTO admin_grants (user_id, granted_by, entitlement_type, starts_at, expires_at, active, notes)
VALUES (
  'aa307a0e-9cd4-4b56-838c-ad5c848014ac',
  'aa307a0e-9cd4-4b56-838c-ad5c848014ac',
  'free_access',
  now(),
  NULL,
  true,
  'Founder / admin access — permanent'
)
ON CONFLICT DO NOTHING;
