-- Scheduler credential for process-trial-expiry, generated in-database and never exposed.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'wmu_trial_expiry_token') THEN
    PERFORM vault.create_secret(
      replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
      'wmu_trial_expiry_token'
    );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.validate_trial_expiry_token(p_token text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
SELECT p_token IS NOT NULL AND p_token = (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'wmu_trial_expiry_token')
$function$;

REVOKE EXECUTE ON FUNCTION public.validate_trial_expiry_token(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_trial_expiry_token(text) TO service_role;
