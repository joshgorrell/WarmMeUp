SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'wmu-trial-expiry-daily';

SELECT cron.schedule('wmu-trial-expiry-daily', '0 15 * * *', $cron$
  SELECT net.http_post(
    url:=(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='wmu_burn_project_url')||'/functions/v1/process-trial-expiry',
    headers:=jsonb_build_object('Content-Type','application/json','x-trial-expiry-token',(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='wmu_trial_expiry_token')),
    body:='{}'::jsonb,timeout_milliseconds:=55000
  ) WHERE EXISTS(SELECT 1 FROM vault.decrypted_secrets WHERE name='wmu_burn_project_url')
$cron$);
