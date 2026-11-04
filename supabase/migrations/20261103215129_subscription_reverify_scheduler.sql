/*
# Schedule RevenueCat re-checks for paid subscriptions

1. Summary
- Adds a scheduler credential that lets a background job ask the subscription check to re-confirm every active Monthly and Annual subscription with RevenueCat.
- Runs every 6 hours (at 00:00, 06:00, 12:00 and 18:00 UTC), so a revoked or lapsed paid subscription is recorded as revoked even when its owner never opens the app.

2. New Objects
- Vault secret `wmu_subscription_reverify_token` (created only if missing; the value is generated in the database and never shown).
- Function `validate_subscription_reverify_token(text)`: returns true only when the supplied token matches that secret.
- Cron job `wmu-subscription-reverify`, which calls the subscription check with the token header.

3. Security
- The validator is SECURITY DEFINER with search_path set, and EXECUTE is revoked from PUBLIC, anon, and authenticated. Only service_role can call it, the same as the trial-expiry validator.
- The token is never returned to any client.

4. Important Notes
- The job only re-confirms rows. It never deletes accounts, disconnects couples, or erases content.
- Re-check results never grant access beyond what RevenueCat confirms.
*/

DO $$
BEGIN
IF NOT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'wmu_subscription_reverify_token') THEN
PERFORM vault.create_secret(
replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
'wmu_subscription_reverify_token'
);
END IF;
END $$;

CREATE OR REPLACE FUNCTION public.validate_subscription_reverify_token(p_token text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
SELECT p_token IS NOT NULL AND p_token = (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'wmu_subscription_reverify_token')
$function$;

REVOKE EXECUTE ON FUNCTION public.validate_subscription_reverify_token(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_subscription_reverify_token(text) TO service_role;

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'wmu-subscription-reverify';

SELECT cron.schedule(
'wmu-subscription-reverify',
'0 0,6,12,18 * * *',
$cron$
SELECT net.http_post(
url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'wmu_burn_project_url') || '/functions/v1/get-effective-subscription',
headers := jsonb_build_object(
'Content-Type', 'application/json',
'x-subscription-reverify-token', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'wmu_subscription_reverify_token')
),
body := '{}'::jsonb,
timeout_milliseconds := 55000
);
$cron$
);
