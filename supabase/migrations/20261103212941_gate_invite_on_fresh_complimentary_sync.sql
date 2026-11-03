ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS rc_verified_at timestamptz;

CREATE OR REPLACE FUNCTION public.stamp_rc_verified_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'active'
     AND NEW.plan IN ('monthly', 'yearly')
     AND NEW.purchase_environment IS NULL THEN
    NEW.rc_verified_at := now();
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.stamp_rc_verified_at() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS stamp_rc_verified_at ON public.subscriptions;
CREATE TRIGGER stamp_rc_verified_at
  BEFORE INSERT OR UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.stamp_rc_verified_at();

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
  v_sub_environment text;
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

  SELECT plan, status, expires_at, purchase_environment, rc_verified_at
  INTO v_sub_plan, v_sub_status, v_sub_expires_at, v_sub_environment, v_sub_verified_at
  FROM public.subscriptions WHERE user_id = p_user_id LIMIT 1;

  IF v_sub_status = 'active'
     AND v_sub_plan IN ('monthly', 'yearly', 'trial')
     AND (v_sub_expires_at IS NULL OR v_sub_expires_at > now())
     AND (
       v_sub_plan = 'trial'
       OR v_sub_environment IS NOT NULL
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