CREATE OR REPLACE FUNCTION public.stamp_rc_verified_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'active' AND NEW.plan IN ('monthly', 'yearly') THEN
    NEW.rc_verified_at := now();
  END IF;
  RETURN NEW;
END;
$function$;