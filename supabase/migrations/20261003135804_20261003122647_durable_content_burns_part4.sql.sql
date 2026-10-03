-- Avatars are private user media too; no unrelated user/admin bypass.
UPDATE storage.buckets SET public=false WHERE id='avatars';
CREATE POLICY private_avatar_read_boundary ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated
USING(bucket_id<>'avatars' OR split_part(name,'/',1)=auth.uid()::text OR EXISTS(
 SELECT 1 FROM couples c WHERE c.active AND auth.uid() IN(c.user_a_id,c.user_b_id)
 AND split_part(name,'/',1) IN(c.user_a_id::text,c.user_b_id::text)));
CREATE POLICY active_partner_avatar_read ON storage.objects FOR SELECT TO authenticated
USING(bucket_id='avatars' AND EXISTS(SELECT 1 FROM couples c WHERE c.active AND auth.uid() IN(c.user_a_id,c.user_b_id) AND split_part(name,'/',1) IN(c.user_a_id::text,c.user_b_id::text)));
CREATE POLICY private_avatar_insert_boundary ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(bucket_id<>'avatars' OR split_part(name,'/',1)=auth.uid()::text);
CREATE POLICY private_avatar_update_boundary ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated USING(bucket_id<>'avatars' OR split_part(name,'/',1)=auth.uid()::text) WITH CHECK(bucket_id<>'avatars' OR split_part(name,'/',1)=auth.uid()::text);
CREATE POLICY private_avatar_delete_boundary ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated USING(bucket_id<>'avatars' OR split_part(name,'/',1)=auth.uid()::text);

CREATE FUNCTION public.finish_content_burn(p_job uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  PERFORM 1 FROM content_burn_jobs WHERE id=p_job FOR UPDATE;
  IF EXISTS(SELECT 1 FROM content_burn_objects o JOIN media_copy_leases l ON o.bucket='vault' AND o.path=ANY(l.paths) WHERE o.job_id=p_job AND l.expires_at>now()) THEN RETURN false; END IF;
  IF EXISTS(SELECT 1 FROM content_burn_objects o JOIN storage.objects s ON s.bucket_id=o.bucket AND s.name=o.path WHERE o.job_id=p_job) THEN RETURN false; END IF;
  DELETE FROM content_burn_objects WHERE job_id=p_job;
  DELETE FROM content_burn_links WHERE job_id=p_job;
  UPDATE content_burn_jobs SET state='complete',completed_at=now() WHERE id=p_job;
  RETURN FOUND;
END $$;

CREATE FUNCTION public.enqueue_due_content_burns() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r record; n integer:=0;
BEGIN
  DELETE FROM media_copy_leases WHERE expires_at<=now();
  FOR r IN SELECT DISTINCT c.id,c.user_a_id FROM couples c WHERE EXISTS(SELECT 1 FROM chat_messages m WHERE m.couple_id=c.id AND (m.deleted_at IS NOT NULL OR m.burns_at<=now())) OR EXISTS(SELECT 1 FROM vault_items v WHERE v.couple_id=c.id AND (v.deleted_at IS NOT NULL OR v.expires_at<=now())) OR EXISTS(SELECT 1 FROM interactions i WHERE i.couple_id=c.id AND i.deleted_at IS NOT NULL) LIMIT 100 LOOP
    PERFORM 1 FROM couples WHERE id=r.id FOR UPDATE;
    PERFORM set_config('wmu.burn_job','',true);
    DELETE FROM chat_messages WHERE couple_id=r.id AND (deleted_at IS NOT NULL OR burns_at<=now());
    DELETE FROM vault_items WHERE couple_id=r.id AND (deleted_at IS NOT NULL OR expires_at<=now());
    DELETE FROM interactions WHERE couple_id=r.id AND deleted_at IS NOT NULL;
    n:=n+1;
  END LOOP;
  DELETE FROM content_burn_jobs j WHERE state='complete' AND completed_at<now()-interval '7 days' AND NOT EXISTS(SELECT 1 FROM account_burn_requests a WHERE j.id=ANY(a.job_ids));
  RETURN n;
END $$;

CREATE FUNCTION public.enqueue_orphan_content_burns() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r record; j uuid; jobs jsonb:='{}'; n integer:=0;
BEGIN
 FOR r IN SELECT s.bucket_id,s.name,c.id FROM storage.objects s JOIN couples c ON c.id::text=split_part(s.name,'/',1)
 WHERE s.bucket_id IN('chat_media','vault')
 AND coalesce((to_jsonb(s)->>'created_at')::timestamptz,now())<now()-interval '24 hours'
 AND NOT EXISTS(SELECT 1 FROM content_burn_objects o WHERE o.bucket=s.bucket_id AND o.path=s.name)
 AND NOT EXISTS(
  SELECT 1 FROM (
   SELECT to_jsonb(m) r FROM chat_messages m WHERE m.couple_id=c.id
   UNION ALL SELECT to_jsonb(v) FROM vault_items v WHERE v.couple_id=c.id
   UNION ALL SELECT to_jsonb(w) FROM wishes w WHERE w.couple_id=c.id
   UNION ALL SELECT to_jsonb(i) FROM interactions i WHERE i.couple_id=c.id
  ) rows CROSS JOIN LATERAL jsonb_each_text(rows.r) pointer
  WHERE pointer.key IN('media_storage_path','thumbnail_path','storage_path','file_path','blurred_thumbnail_path','image_storage_path','fulfilled_image_path','fulfilled_thumbnail_path','media_url')
  AND (pointer.value=s.name OR position(s.name IN pointer.value)>0 OR regexp_replace(pointer.value,'\.[^./]+$','_thumb.jpg')=s.name)
 ) LIMIT 500 LOOP
  j:=nullif(jobs->>r.id::text,'')::uuid;
  IF j IS NULL THEN
   INSERT INTO content_burn_jobs(couple_id,kind) VALUES(r.id,'orphan') RETURNING id INTO j;
   jobs:=jsonb_set(jobs,ARRAY[r.id::text],to_jsonb(j::text));
  END IF;
  PERFORM burn_capture_path(j,r.id,r.bucket_id,r.name);
  n:=n+1;
 END LOOP;
 RETURN n;
END $$;

CREATE TABLE public.account_burn_requests (
 user_id uuid PRIMARY KEY, job_ids uuid[] NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE account_burn_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON account_burn_requests FROM PUBLIC,anon,authenticated;
GRANT ALL ON account_burn_requests TO service_role;

CREATE FUNCTION public.prepare_account_burn(p_user uuid) RETURNS uuid[]
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r record; ids uuid[]:='{}'; j uuid;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 SELECT job_ids INTO ids FROM account_burn_requests WHERE user_id=p_user;
 IF FOUND THEN RETURN ids; END IF;
 ids:='{}';
 FOR r IN SELECT id FROM couples WHERE user_a_id=p_user OR user_b_id=p_user LOOP
  ids:=array_append(ids,prepare_content_burn(r.id,p_user,'account'));
 END LOOP;
 INSERT INTO content_burn_jobs(actor_id,kind) VALUES(p_user,'account') RETURNING id INTO j;
 INSERT INTO content_burn_objects SELECT j,'avatars',name FROM storage.objects WHERE bucket_id='avatars' AND split_part(name,'/',1)=p_user::text;
 ids:=array_append(ids,j);
 INSERT INTO account_burn_requests(user_id,job_ids) VALUES(p_user,ids);
 RETURN ids;
END $$;

CREATE FUNCTION public.guard_media_upload_during_burn() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE owner_prefix text:=split_part(NEW.name,'/',1);
BEGIN
 IF NEW.bucket_id IN ('chat_media','vault') THEN
  IF owner_prefix !~ '^[0-9a-f-]{36}$' THEN RAISE EXCEPTION 'Invalid media owner' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM couples WHERE id=owner_prefix::uuid FOR UPDATE;
 END IF;
 IF NEW.bucket_id='avatars' THEN PERFORM pg_advisory_xact_lock(hashtextextended(owner_prefix,0)); END IF;
 IF NEW.bucket_id IN ('chat_media','vault') AND (
   NOT EXISTS(SELECT 1 FROM couples WHERE id::text=owner_prefix AND active)
   OR EXISTS(SELECT 1 FROM content_burn_jobs WHERE couple_id::text=owner_prefix AND state='pending')) THEN
  RAISE EXCEPTION 'Media cleanup in progress' USING ERRCODE='42501';
 END IF;
 IF NEW.bucket_id='avatars' AND (NOT EXISTS(SELECT 1 FROM auth.users WHERE id::text=owner_prefix) OR EXISTS(SELECT 1 FROM account_burn_requests WHERE user_id::text=owner_prefix)) THEN
  RAISE EXCEPTION 'Account deletion in progress' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_media_upload_during_burn BEFORE INSERT OR UPDATE OF name,bucket_id ON storage.objects
FOR EACH ROW EXECUTE FUNCTION guard_media_upload_during_burn();

DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN('burn_current_job','burn_capture_path','capture_deleted_content','capture_burn_links','acknowledge_content_burn_objects','hard_burn_tombstone','prepare_content_burn','finish_content_burn','enqueue_due_content_burns','prepare_account_burn','guard_media_upload_during_burn','guard_content_media_references','enqueue_orphan_content_burns','queue_failed_media_copy','begin_media_copy','end_media_copy') LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',r.signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',r.signature);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
