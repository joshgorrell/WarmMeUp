-- SCHEDULER START (hosted extensions)
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime')
 AND NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='couple_content_changes') THEN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.couple_content_changes;
 END IF;
END $$;
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;

DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM vault.decrypted_secrets WHERE name='wmu_burn_worker_token') THEN
    PERFORM vault.create_secret(gen_random_uuid()::text||gen_random_uuid()::text,'wmu_burn_worker_token');
  END IF;
END $$;

CREATE FUNCTION public.validate_burn_worker_token(p_token text) RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT p_token IS NOT NULL AND p_token=(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='wmu_burn_worker_token')
$$;
REVOKE ALL ON FUNCTION public.validate_burn_worker_token(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.validate_burn_worker_token(text) TO service_role;

SELECT cron.schedule('wmu-burn-expiry','* * * * *','SELECT public.enqueue_due_content_burns()');
SELECT cron.schedule('wmu-burn-orphans','17 * * * *','SELECT public.enqueue_orphan_content_burns()');
SELECT cron.schedule('wmu-burn-worker','* * * * *',$cron$
  SELECT net.http_post(
    url:=(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='wmu_burn_project_url')||'/functions/v1/process-content-burns',
    headers:=jsonb_build_object('Content-Type','application/json','x-burn-worker-token',(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='wmu_burn_worker_token')),
    body:='{}'::jsonb,timeout_milliseconds:=55000
  ) WHERE EXISTS(SELECT 1 FROM vault.decrypted_secrets WHERE name='wmu_burn_project_url')
$cron$);

NOTIFY pgrst, 'reload schema';
