-- READ-ONLY production verification. Run with authorized maintenance access.
-- Outputs policy/configuration/aggregate evidence, not private messages or media.
-- It does not prove erasure, remediate data, or expose secrets.

-- All client-exposed app tables should have RLS enabled unless deliberately public.
SELECT n.nspname AS schema_name,c.relname,c.relrowsecurity,c.relforcerowsecurity
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname IN ('public','storage') AND c.relkind IN ('r','p') ORDER BY 1,2;

SELECT schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
FROM pg_policies WHERE schemaname IN ('public','storage') ORDER BY 1,2,3;

-- Expect private chat/vault; investigate avatars independently of source defaults.
SELECT id,public FROM storage.buckets WHERE id IN ('chat_media','vault','avatars');

-- Reviewer profiles must not be administrators; identify the exact two test logins.
SELECT r.user_id,u.email,p.is_admin,p.is_super_admin,
  (SELECT count(*) FROM public.couples c WHERE c.active AND r.user_id IN (c.user_a_id,c.user_b_id)) AS active_relationships
FROM public.permanent_review_access r
JOIN auth.users u ON u.id=r.user_id JOIN public.profiles p ON p.id=r.user_id;

-- Expect no anon/authenticated execution for wipe and cross-couple maintenance.
SELECT p.oid::regprocedure AS function_name,p.prosecdef,
  has_function_privilege('anon',p.oid,'EXECUTE') AS anon_exec,
  has_function_privilege('authenticated',p.oid,'EXECUTE') AS client_exec,
  has_function_privilege('service_role',p.oid,'EXECUTE') AS server_exec,
  p.proconfig
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND (p.prosecdef OR p.proname IN ('wipe_couple_data','cleanup_orphaned_wish_activity'))
ORDER BY p.proname;

-- Retained tombstones and overdue timers: nonzero values require a purge audit.
SELECT 'chat_tombstones' AS check_name,count(*) AS retained FROM public.chat_messages WHERE deleted_at IS NOT NULL
UNION ALL SELECT 'vault_tombstones',count(*) FROM public.vault_items WHERE deleted_at IS NOT NULL
UNION ALL SELECT 'interaction_tombstones',count(*) FROM public.interactions WHERE deleted_at IS NOT NULL
UNION ALL SELECT 'overdue_unburned_chat',count(*) FROM public.chat_messages WHERE deleted_at IS NULL AND burns_at<=now();

-- Objects still referenced by deleted vault rows, including thumbnails.
SELECT o.bucket_id,count(*) AS retained_objects
FROM storage.objects o WHERE EXISTS (
  SELECT 1 FROM public.vault_items v WHERE v.deleted_at IS NOT NULL
  AND coalesce(v.storage_bucket,'vault')=o.bucket_id
  AND o.name IN (v.storage_path,v.file_path,v.blurred_thumbnail_path)
) GROUP BY o.bucket_id;

-- Inspect scheduler configuration separately if pg_cron is installed; never
-- print cron command text, which could contain privileged tokens.
SELECT extname FROM pg_extension WHERE extname IN ('pg_cron','pg_net');
-- If pg_cron exists: SELECT jobid,jobname,schedule,active FROM cron.job;

-- Backups/PITR retention, deployed Edge versions, external storage backups,
-- CDN behavior, device caches and actual reviewer-session attacks require
-- dashboard/integration/device checks; SQL catalogs cannot certify them.
