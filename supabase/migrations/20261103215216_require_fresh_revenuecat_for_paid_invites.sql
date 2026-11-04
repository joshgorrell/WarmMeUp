/*
# Require fresh RevenueCat confirmation for every paid invite

1. Summary
- Invitation eligibility for Monthly and Annual subscribers now requires a RevenueCat confirmation within the last 24 hours, for every purchase environment (production, sandbox, and complimentary).
- Previously, sandbox and production rows passed the invite gate on their stored end date alone, so a revoked row could keep invite permission until its end date.

2. Modified Functions
- user_has_premium_access(uuid): the paid-subscription branch no longer accepts a row because it has a purchase environment. It requires rc_verified_at within the last 24 hours. Trials, the admin and super-admin checks, and the admin grant branch are unchanged.

3. Security
- The function is replaced in place with CREATE OR REPLACE, so its SECURITY DEFINER mode, search_path, and EXECUTE grants are unchanged.
- Existing callers (generate_invite_code) are unchanged.

4. Important Notes
- Paid rows are re-confirmed on each subscription check and by the scheduled re-check, which refreshes rc_verified_at every 6 hours.
- Nothing is deleted or disconnected. Only the invite permission check changes.
*/

CREATE OR REPLACE FUNCTION public.user_has_premium_access(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
v_is_admin boolean;
v_is_super_admin boolean;
v_sub_plan text;
v_sub_status text;
v_sub_expires_at timestamptz;
v_sub_verified_at timestamptz;
v_grant_active boolean;
v_grant_expires timestamptz;
v_grant_can_invite boolean;
BEGIN
IF p_user_id IS NULL THEN
RETURN false;
END IF;

SELECT is_admin, is_super_admin INTO v_is_admin, v_is_super_admin
FROM public.profiles WHERE id = p_user_id;

IF v_is_super_admin IS NULL AND v_is_admin IS NULL THEN
NULL;
ELSIF v_is_super_admin = true OR v_is_admin = true THEN
RETURN true;
END IF;

SELECT plan, status, expires_at, rc_verified_at
INTO v_sub_plan, v_sub_status, v_sub_expires_at, v_sub_verified_at
FROM public.subscriptions WHERE user_id = p_user_id LIMIT 1;

IF v_sub_status = 'active'
AND v_sub_plan IN ('monthly', 'yearly', 'trial')
AND (v_sub_expires_at IS NULL OR v_sub_expires_at > now())
AND (
v_sub_plan = 'trial'
OR v_sub_verified_at > now() - interval '24 hours'
) THEN
RETURN true;
END IF;

SELECT active, expires_at, can_invite INTO v_grant_active, v_grant_expires, v_grant_can_invite
FROM public.admin_grants WHERE user_id = p_user_id
ORDER BY created_at DESC LIMIT 1;

IF v_grant_active = true AND v_grant_can_invite = true
AND (v_grant_expires IS NULL OR v_grant_expires > now()) THEN
RETURN true;
END IF;

RETURN false;
END;
$function$;
