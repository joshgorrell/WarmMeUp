-- Read-only. Run in the Warm Me Up Bolt-managed database SQL editor.
-- Does not inspect hashes, tokens, messages or media and changes no accounts.
WITH target AS (
  SELECT id, email, email_confirmed_at IS NOT NULL AS email_verified,
         coalesce(encrypted_password, '') <> '' AS has_password
  FROM auth.users
  WHERE lower(email) IN ('test3@ksav.com', 'test4@ksav.com')
)
SELECT t.*, p.is_admin, p.is_super_admin,
       p.onboarding_completed_at IS NOT NULL AS onboarding_complete,
       p.age_verified_at IS NOT NULL AS age_verified,
       p.tos_accepted_at IS NOT NULL AS terms_accepted,
       s.plan, s.status, s.expires_at, s.purchase_environment,
       EXISTS (SELECT 1 FROM public.permanent_review_access r
               WHERE r.user_id = t.id) AS permanent_review_access,
       c.id AS couple_id, c.active AS couple_active,
       partner.email AS partner_email,
       CASE WHEN c.user_a_id = t.id THEN c.user_b_id ELSE c.user_a_id END
         IN (SELECT id FROM target) AS paired_with_other_test_account
FROM target t
LEFT JOIN public.profiles p ON p.id = t.id
LEFT JOIN public.subscriptions s ON s.user_id = t.id
LEFT JOIN public.couples c ON (c.user_a_id = t.id OR c.user_b_id = t.id)
LEFT JOIN auth.users partner ON partner.id =
  CASE WHEN c.user_a_id = t.id THEN c.user_b_id ELSE c.user_a_id END
ORDER BY t.email, c.active DESC;
