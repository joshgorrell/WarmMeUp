BEGIN;

-- Durable receipts contain identifiers only. No message text or media bytes.
CREATE TABLE public.content_burn_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id uuid,
  actor_id uuid,
  kind text NOT NULL DEFAULT 'legacy',
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','complete')),
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  next_attempt_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.content_burn_objects (
  job_id uuid NOT NULL REFERENCES public.content_burn_jobs(id) ON DELETE CASCADE,
  bucket text NOT NULL CHECK (bucket IN ('chat_media','vault','avatars')),
  path text NOT NULL,
  PRIMARY KEY(job_id,bucket,path)
);
ALTER TABLE public.content_burn_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_burn_objects ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.content_burn_jobs,public.content_burn_objects FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.content_burn_jobs,public.content_burn_objects TO service_role;
CREATE INDEX content_burn_pending ON public.content_burn_jobs(next_attempt_at) WHERE state='pending';
CREATE INDEX content_burn_object_path ON public.content_burn_objects(bucket,path);

-- Realtime DELETE cannot reliably filter by couple. Publish a content-free,
-- RLS-authorized invalidation counter instead of subscribing to global IDs.
CREATE TABLE public.couple_content_changes (
 couple_id uuid PRIMARY KEY REFERENCES public.couples(id) ON DELETE CASCADE,
 revision bigint NOT NULL DEFAULT 0
);
ALTER TABLE couple_content_changes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON couple_content_changes FROM PUBLIC,anon,authenticated;
GRANT SELECT ON couple_content_changes TO authenticated;
GRANT ALL ON couple_content_changes TO service_role;
CREATE POLICY active_members_read_content_changes ON couple_content_changes FOR SELECT TO authenticated
USING(EXISTS(SELECT 1 FROM couples c WHERE c.id=couple_id AND c.active AND auth.uid() IN(c.user_a_id,c.user_b_id)));

-- Reserve copy destinations before external Storage requests. Burns include
-- them and cannot complete while a previously-authorized copy is in flight.
CREATE TABLE public.media_copy_leases (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), couple_id uuid NOT NULL,
 chat_id uuid NOT NULL, actor_id uuid NOT NULL, paths text[] NOT NULL,
 expires_at timestamptz NOT NULL DEFAULT now()+interval '10 minutes'
);
ALTER TABLE media_copy_leases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON media_copy_leases FROM PUBLIC,anon,authenticated;
GRANT ALL ON media_copy_leases TO service_role;
CREATE FUNCTION public.begin_media_copy(p_couple uuid,p_actor uuid,p_chat uuid,p_paths text[]) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE j uuid; path text;
BEGIN
 PERFORM 1 FROM couples WHERE id=p_couple AND active AND p_actor IN(user_a_id,user_b_id) FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Invalid couple' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM chat_messages WHERE id=p_chat AND couple_id=p_couple AND deleted_at IS NULL) THEN RAISE EXCEPTION 'Source deleted' USING ERRCODE='42501'; END IF;
 FOREACH path IN ARRAY p_paths LOOP
  IF path NOT LIKE p_couple::text||'/'||p_actor::text||'/%' OR path ~ '(^|/)\.\.(/|$)' THEN RAISE EXCEPTION 'Invalid copy target' USING ERRCODE='42501'; END IF;
 END LOOP;
 INSERT INTO media_copy_leases(couple_id,chat_id,actor_id,paths) VALUES(p_couple,p_chat,p_actor,p_paths) RETURNING id INTO j;
 RETURN j;
END $$;
CREATE FUNCTION public.end_media_copy(p_lease uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$ DELETE FROM media_copy_leases WHERE id=p_lease $$;

CREATE FUNCTION public.burn_current_job(p_couple uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE j uuid;
BEGIN
  PERFORM 1 FROM couples WHERE id=p_couple FOR UPDATE;
  j := nullif(current_setting('wmu.burn_job',true),'')::uuid;
  IF j IS NOT NULL AND NOT EXISTS(SELECT 1 FROM content_burn_jobs WHERE id=j AND couple_id IS NOT DISTINCT FROM p_couple) THEN j:=NULL; END IF;
  IF j IS NULL THEN
    INSERT INTO content_burn_jobs(couple_id,actor_id) VALUES(p_couple,auth.uid()) RETURNING id INTO j;
    PERFORM set_config('wmu.burn_job',j::text,true);
  END IF;
  IF NOT EXISTS(SELECT 1 FROM content_burn_jobs WHERE id=j AND couple_id IS NOT DISTINCT FROM p_couple) THEN
    RAISE EXCEPTION 'Burn scope mismatch';
  END IF;
  RETURN j;
END $$;

CREATE FUNCTION public.burn_capture_path(p_job uuid,p_couple uuid,p_bucket text,p_path text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF p_path IS NULL OR p_path='' THEN RETURN; END IF;
  -- Do not turn a corrupt or forged row pointer into privileged foreign deletion.
  IF p_bucket NOT IN ('chat_media','vault') OR split_part(p_path,'/',1)<>p_couple::text
    OR p_path LIKE '%://%' OR p_path ~ '(^|/)\.\.(/|$)' THEN
    RAISE EXCEPTION 'Invalid owned media path';
  END IF;
  INSERT INTO content_burn_objects VALUES(p_job,p_bucket,p_path) ON CONFLICT DO NOTHING;
  IF p_path ~ '_thumb\.jpg$' THEN RETURN; END IF;
  -- Include historical derived thumbnails even when old rows lack a pointer.
  INSERT INTO content_burn_objects VALUES(p_job,p_bucket,
    CASE WHEN p_path ~ '\.[^./]+$' THEN regexp_replace(p_path,'\.[^./]+$','_thumb.jpg') ELSE p_path||'_thumb.jpg' END)
    ON CONFLICT DO NOTHING;
END $$;

-- Snapshot relationship IDs before FK SET NULL/cascade triggers erase them.
CREATE TABLE public.content_burn_links (
 job_id uuid NOT NULL REFERENCES content_burn_jobs(id) ON DELETE CASCADE,
 table_name text NOT NULL, item_id uuid NOT NULL,
 PRIMARY KEY(job_id,table_name,item_id)
);
ALTER TABLE content_burn_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON content_burn_links FROM PUBLIC,anon,authenticated;
GRANT ALL ON content_burn_links TO service_role;
CREATE FUNCTION public.capture_burn_links() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE j uuid:=burn_current_job(OLD.couple_id); r jsonb:=to_jsonb(OLD);
BEGIN
 IF current_setting('wmu.burn_all',true)='true' THEN RETURN OLD; END IF;
 IF TG_TABLE_NAME='chat_messages' THEN
  INSERT INTO content_burn_objects SELECT j,'vault',path FROM media_copy_leases l CROSS JOIN LATERAL unnest(l.paths) path WHERE l.couple_id=OLD.couple_id AND l.chat_id=OLD.id ON CONFLICT DO NOTHING;
  INSERT INTO content_burn_links SELECT j,'vault_items',id FROM vault_items WHERE couple_id=OLD.couple_id AND (chat_message_id=OLD.id OR id=nullif(r->>'vault_item_id','')::uuid) ON CONFLICT DO NOTHING;
 ELSIF TG_TABLE_NAME='interactions' THEN
  INSERT INTO content_burn_links SELECT j,'vault_items',id FROM vault_items WHERE couple_id=OLD.couple_id AND id=nullif(r->>'vault_item_id','')::uuid ON CONFLICT DO NOTHING;
  INSERT INTO content_burn_links SELECT j,'chat_messages',id FROM chat_messages WHERE couple_id=OLD.couple_id AND id=nullif(r->>'dare_chat_message_id','')::uuid ON CONFLICT DO NOTHING;
 ELSIF TG_TABLE_NAME='vault_items' THEN
  INSERT INTO content_burn_links SELECT j,'chat_messages',id FROM chat_messages WHERE couple_id=OLD.couple_id AND (vault_item_id=OLD.id OR id=nullif(r->>'chat_message_id','')::uuid) ON CONFLICT DO NOTHING;
 END IF;
 INSERT INTO content_burn_links
 SELECT j,x.table_name,(x.row_data->>'id')::uuid FROM (
  SELECT 'chat_messages' table_name,to_jsonb(m) row_data FROM chat_messages m WHERE m.couple_id=OLD.couple_id
  UNION ALL SELECT 'vault_items',to_jsonb(v) FROM vault_items v WHERE v.couple_id=OLD.couple_id
  UNION ALL SELECT 'wishes',to_jsonb(w) FROM wishes w WHERE w.couple_id=OLD.couple_id
  UNION ALL SELECT 'interactions',to_jsonb(i) FROM interactions i WHERE i.couple_id=OLD.couple_id
 ) x WHERE NOT(x.table_name=TG_TABLE_NAME AND x.row_data->>'id'=OLD.id::text)
 AND EXISTS(SELECT 1 FROM jsonb_each_text(r) src JOIN jsonb_each_text(x.row_data) dst ON src.value=dst.value
   WHERE src.key IN('media_storage_path','storage_path','image_storage_path','fulfilled_image_path')
   AND dst.key IN('media_storage_path','storage_path','image_storage_path','fulfilled_image_path') AND src.value<>'')
 ON CONFLICT DO NOTHING;
 INSERT INTO content_burn_links SELECT j,'activity_events',e.id FROM activity_events e WHERE e.couple_id=OLD.couple_id AND (e.vault_item_id=OLD.id OR e.wish_id=OLD.id OR position(OLD.id::text IN coalesce(e.metadata::text,''))>0) ON CONFLICT DO NOTHING;
 RETURN OLD;
END $$;

CREATE FUNCTION public.capture_deleted_content() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r jsonb:=to_jsonb(OLD); c uuid:=OLD.couple_id; j uuid; b text; link record;
BEGIN
  j:=burn_current_job(c);
  b:=coalesce(r->>'media_storage_bucket','chat_media');
  PERFORM burn_capture_path(j,c,b,r->>'media_storage_path');
  IF TG_TABLE_NAME IN ('chat_messages','interactions') THEN PERFORM burn_capture_path(j,c,b,r->>'thumbnail_path'); END IF;
  IF TG_TABLE_NAME='vault_items' THEN
    b:=coalesce(r->>'storage_bucket','vault');
    PERFORM burn_capture_path(j,c,b,coalesce(r->>'storage_path',r->>'file_path'));
    PERFORM burn_capture_path(j,c,b,r->>'blurred_thumbnail_path');
  ELSIF TG_TABLE_NAME='wishes' THEN
    b:=coalesce(r->>'image_storage_bucket','vault');
    PERFORM burn_capture_path(j,c,b,r->>'image_storage_path');
    PERFORM burn_capture_path(j,c,b,r->>'thumbnail_path');
    PERFORM burn_capture_path(j,c,b,r->>'fulfilled_image_path');
    PERFORM burn_capture_path(j,c,b,r->>'fulfilled_thumbnail_path');
  END IF;
  INSERT INTO couple_content_changes(couple_id,revision) VALUES(c,1)
    ON CONFLICT(couple_id) DO UPDATE SET revision=couple_content_changes.revision+1;
  DELETE FROM media_reactions WHERE couple_id=c AND source_id=OLD.id;
  IF TG_TABLE_NAME='wishes' THEN DELETE FROM wish_reactions WHERE wish_id=OLD.id; END IF;
  IF current_setting('wmu.burn_all',true)='true' THEN RETURN OLD; END IF;
  -- Resolve every saved copy, not just the last vault_item_id on the message.
  IF TG_TABLE_NAME='chat_messages' THEN
    DELETE FROM interactions i WHERE i.couple_id=c AND (to_jsonb(i)->>'dare_chat_message_id')=OLD.id::text;
    DELETE FROM vault_items WHERE couple_id=c AND
      (chat_message_id=OLD.id OR id=nullif(r->>'vault_item_id','')::uuid);
  ELSIF TG_TABLE_NAME='vault_items' THEN
    DELETE FROM interactions i WHERE i.couple_id=c AND (to_jsonb(i)->>'vault_item_id')=OLD.id::text;
    DELETE FROM chat_messages WHERE couple_id=c AND
      (vault_item_id=OLD.id OR id=nullif(r->>'chat_message_id','')::uuid);
    DELETE FROM activity_events WHERE couple_id=c AND vault_item_id=OLD.id;
  ELSIF TG_TABLE_NAME='wishes' THEN
    DELETE FROM activity_events WHERE couple_id=c AND wish_id=OLD.id;
  END IF;
  -- Chat activity cards contain copies of wish/interaction text and references.
  IF TG_TABLE_NAME IN ('wishes','interactions','vault_items') THEN
    DELETE FROM chat_messages m WHERE m.couple_id=c AND (
      (m.content_text LIKE '__WMU_ACTIVITY__:%' AND position(OLD.id::text IN m.content_text)>0)
      OR (to_jsonb(m)->>'dare_interaction_id')=OLD.id::text);
  END IF;
  DELETE FROM activity_events e WHERE e.couple_id=c AND position(OLD.id::text IN coalesce(e.metadata::text,''))>0;
  DELETE FROM media_reactions WHERE couple_id=c AND source_id=OLD.id;
  IF TG_TABLE_NAME='wishes' THEN DELETE FROM wish_reactions WHERE wish_id=OLD.id; END IF;
  FOR link IN SELECT table_name,item_id FROM content_burn_links WHERE job_id=j LOOP
    EXECUTE format('DELETE FROM public.%I WHERE id=$1 AND couple_id=$2',link.table_name) USING link.item_id,c;
    DELETE FROM content_burn_links WHERE job_id=j AND table_name=link.table_name AND item_id=link.item_id;
  END LOOP;
  RETURN OLD;
END $$;

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['chat_messages','vault_items','wishes','interactions'] LOOP
    EXECUTE format('CREATE TRIGGER capture_burn_links BEFORE DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.capture_burn_links()',t);
    EXECUTE format('CREATE TRIGGER durable_content_delete AFTER DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.capture_deleted_content()',t);
  END LOOP;
END $$;

-- Older installed apps still soft-delete: convert their successful update to
-- a hard deletion in the same transaction, invoking the same inventory trigger.
CREATE FUNCTION public.hard_burn_tombstone() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF NEW.deleted_at IS NOT NULL THEN
    EXECUTE format('DELETE FROM public.%I WHERE id=$1 AND couple_id=$2',TG_TABLE_NAME) USING NEW.id,NEW.couple_id;
  END IF;
  RETURN NEW;
END $$;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['chat_messages','vault_items','interactions'] LOOP
    EXECUTE format('CREATE TRIGGER hard_burn_tombstone AFTER INSERT OR UPDATE OF deleted_at ON public.%I FOR EACH ROW EXECUTE FUNCTION public.hard_burn_tombstone()',t);
  END LOOP;
END $$;

CREATE FUNCTION public.prepare_content_burn(p_couple uuid,p_actor uuid,p_kind text,p_ids uuid[] DEFAULT '{}',p_categories text[] DEFAULT '{}')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c couples%ROWTYPE; j uuid; t text; all_content boolean;
BEGIN
  SELECT * INTO c FROM couples WHERE id=p_couple FOR UPDATE;
  IF NOT FOUND OR p_actor IS NULL OR p_actor NOT IN(c.user_a_id,coalesce(c.user_b_id,c.user_a_id)) THEN
    RAISE EXCEPTION 'Not a couple member' USING ERRCODE='42501';
  END IF;
  IF NOT c.active AND p_kind NOT IN ('disconnect','account','maintenance') THEN
    RAISE EXCEPTION 'Inactive couple' USING ERRCODE='42501';
  END IF;
  IF p_kind NOT IN ('chat','vault','wish','categories','disconnect','account','maintenance') THEN RAISE EXCEPTION 'Invalid burn kind'; END IF;
  IF p_kind IN ('chat','vault','wish') AND (cardinality(p_ids)=0 OR cardinality(p_ids)>500) THEN RAISE EXCEPTION 'Invalid item selection'; END IF;
  IF NOT p_categories <@ ARRAY['all','chat','vault','wish','dice','dare','activity','points']::text[] THEN RAISE EXCEPTION 'Invalid categories'; END IF;
  -- Fail the entire request if any supplied item belongs to another couple.
  IF p_kind IN ('chat','vault','wish') THEN
    t:=CASE p_kind WHEN 'chat' THEN 'chat_messages' WHEN 'vault' THEN 'vault_items' ELSE 'wishes' END;
    EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I WHERE id=ANY($1) AND couple_id<>$2)',t) INTO all_content USING p_ids,p_couple;
    IF all_content THEN RAISE EXCEPTION 'Foreign item' USING ERRCODE='42501'; END IF;
  END IF;
  INSERT INTO content_burn_jobs(couple_id,actor_id,kind) VALUES(p_couple,p_actor,p_kind) RETURNING id INTO j;
  PERFORM set_config('wmu.burn_job',j::text,true);
  all_content:=p_kind IN ('disconnect','account') OR 'all'=ANY(p_categories);
  PERFORM set_config('wmu.burn_all',all_content::text,true);
  IF p_kind IN ('chat','vault','wish') THEN
    EXECUTE format('DELETE FROM public.%I WHERE couple_id=$1 AND id=ANY($2)',t) USING p_couple,p_ids;
  ELSE
    IF all_content OR 'chat'=ANY(p_categories) THEN DELETE FROM chat_messages WHERE couple_id=p_couple; END IF;
    IF all_content OR 'vault'=ANY(p_categories) THEN DELETE FROM vault_items WHERE couple_id=p_couple; END IF;
    IF all_content OR 'wish'=ANY(p_categories) THEN DELETE FROM wishes WHERE couple_id=p_couple; END IF;
    DELETE FROM interactions WHERE couple_id=p_couple AND (all_content OR
      ('dice'=ANY(p_categories) AND type='dice') OR ('dare'=ANY(p_categories) AND type IN ('dare','tell_me')) OR ('wish'=ANY(p_categories) AND type='wish'));
    IF all_content OR 'activity'=ANY(p_categories) THEN
      DELETE FROM activity_events WHERE couple_id=p_couple;
      DELETE FROM activity_views WHERE couple_id=p_couple;
      DELETE FROM chat_messages WHERE couple_id=p_couple AND content_text LIKE '__WMU_ACTIVITY__:%';
    END IF;
    IF all_content OR 'points'=ANY(p_categories) THEN
      DELETE FROM cash_in_events WHERE couple_id=p_couple;
      DELETE FROM point_events WHERE couple_id=p_couple;
      DELETE FROM monthly_scores WHERE couple_id=p_couple;
      UPDATE scores SET points=0 WHERE couple_id=p_couple;
    END IF;
    IF all_content THEN
      DELETE FROM media_reactions WHERE couple_id=p_couple;
      INSERT INTO content_burn_objects SELECT j,'vault',path FROM media_copy_leases l CROSS JOIN LATERAL unnest(l.paths) path WHERE l.couple_id=p_couple ON CONFLICT DO NOTHING;
      -- Capture all existing bytes, including unreferenced/failed uploads.
      INSERT INTO content_burn_objects SELECT j,bucket_id,name FROM storage.objects
        WHERE bucket_id IN('chat_media','vault') AND split_part(name,'/',1)=p_couple::text ON CONFLICT DO NOTHING;
      IF to_regclass('public.messages') IS NOT NULL THEN EXECUTE 'DELETE FROM public.messages WHERE couple_id=$1' USING p_couple; END IF;
      IF p_kind IN ('disconnect','account') THEN
        DELETE FROM couple_hidden_prompts WHERE couple_id=p_couple;
        IF to_regclass('public.couple_custom_prompts') IS NOT NULL THEN EXECUTE 'DELETE FROM public.couple_custom_prompts WHERE couple_id=$1' USING p_couple; END IF;
        UPDATE couples SET active=false,user_b_id=NULL,disconnected_at=now(),subscription_owner_id=NULL,invite_code=NULL,first_moment_completed_at=NULL WHERE id=p_couple;
        UPDATE user_settings SET celebration_seen=false WHERE user_id IN(c.user_a_id,c.user_b_id);
      END IF;
    END IF;
  END IF;
  -- A retry may target rows already hard-deleted by an earlier pending job.
  -- Include outstanding manifests so an empty retry cannot claim completion.
  INSERT INTO content_burn_objects SELECT j,o.bucket,o.path FROM content_burn_objects o JOIN content_burn_jobs old ON old.id=o.job_id WHERE old.couple_id=p_couple AND old.state='pending' AND old.id<>j ON CONFLICT DO NOTHING;
  INSERT INTO couple_content_changes(couple_id,revision) VALUES(p_couple,1) ON CONFLICT(couple_id) DO UPDATE SET revision=couple_content_changes.revision+1;
  RETURN j;
END $$;

-- Prevent foreign pointers and reattaching a saved copy after its source burn.
CREATE FUNCTION public.guard_content_media_references() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r jsonb:=to_jsonb(NEW); k text; path text;
BEGIN
 PERFORM 1 FROM couples WHERE id=NEW.couple_id FOR UPDATE;
 IF TG_OP='INSERT' AND EXISTS(SELECT 1 FROM content_burn_jobs WHERE couple_id=NEW.couple_id AND state='pending') THEN
   RAISE EXCEPTION 'Content cleanup in progress' USING ERRCODE='42501';
 END IF;
 FOREACH k IN ARRAY ARRAY['media_storage_path','thumbnail_path','storage_path','blurred_thumbnail_path','image_storage_path','fulfilled_image_path','fulfilled_thumbnail_path'] LOOP
  path:=r->>k;
  IF path IS NOT NULL AND path<>'' AND (split_part(path,'/',1)<>NEW.couple_id::text OR path LIKE '%://%' OR path ~ '(^|/)\.\.(/|$)') THEN
   RAISE EXCEPTION 'Invalid media reference' USING ERRCODE='42501';
  END IF;
 END LOOP;
 IF r->>'chat_message_id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM chat_messages WHERE id=(r->>'chat_message_id')::uuid AND couple_id=NEW.couple_id AND deleted_at IS NULL) THEN RAISE EXCEPTION 'Invalid chat source' USING ERRCODE='42501'; END IF;
 IF r->>'vault_item_id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM vault_items WHERE id=(r->>'vault_item_id')::uuid AND couple_id=NEW.couple_id AND deleted_at IS NULL) THEN RAISE EXCEPTION 'Invalid vault source' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['chat_messages','vault_items','wishes','interactions'] LOOP
  EXECUTE format('CREATE TRIGGER guard_content_media_references BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION guard_content_media_references()',t);
 END LOOP;
END $$;

CREATE FUNCTION public.queue_failed_media_copy(p_couple uuid,p_actor uuid,p_paths text[]) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE j uuid; path text;
BEGIN
 INSERT INTO content_burn_jobs(couple_id,actor_id,kind) VALUES(p_couple,p_actor,'failed_copy') RETURNING id INTO j;
 FOREACH path IN ARRAY p_paths LOOP PERFORM burn_capture_path(j,p_couple,'vault',path); END LOOP;
 RETURN j;
END $$;

-- RLS denies new direct downloads/signatures for queued deletion paths.
CREATE FUNCTION public.media_is_not_burning(p_bucket text,p_path text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT NOT EXISTS(SELECT 1 FROM content_burn_objects o JOIN content_burn_jobs j ON j.id=o.job_id
    WHERE j.state='pending' AND o.bucket=p_bucket AND o.path=p_path)
$$;
REVOKE ALL ON FUNCTION public.media_is_not_burning(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.media_is_not_burning(text,text) TO authenticated;
CREATE POLICY pending_burn_media_boundary ON storage.objects AS RESTRICTIVE FOR ALL TO authenticated
USING(public.media_is_not_burning(bucket_id,name)) WITH CHECK(public.media_is_not_burning(bucket_id,name));

CREATE FUNCTION public.acknowledge_content_burn_objects(p_job uuid,p_bucket text,p_paths text[]) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
 DELETE FROM content_burn_objects o WHERE o.job_id=p_job AND o.bucket=p_bucket AND o.path=ANY(p_paths)
 AND NOT EXISTS(SELECT 1 FROM storage.objects s WHERE s.bucket_id=o.bucket AND s.name=o.path)
 AND NOT EXISTS(SELECT 1 FROM media_copy_leases l WHERE l.expires_at>now() AND o.bucket='vault' AND o.path=ANY(l.paths))
$$;

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

-- The worker verifies Storage metadata after API removal, then erases its path
-- inventory; receipts keep no customer content or permanent file-location log.
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
  -- Also purge historical tombstones. Triggers capture all linked copies.
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

-- Historical orphan cleanup: allow a day for uploads in flight, then queue
-- unreferenced originals/thumbnails. Never SQL-delete Storage metadata.
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
 -- Serialize repeat requests, preserving the original manifest after auth cascades.
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

-- Prevent new uploads from recreating bytes during an accepted purge, including
-- privileged copies racing with a disconnect. The Storage API itself is gated.
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

-- SCHEDULER START (hosted extensions; isolated tests skip this block)
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
-- Use this project's URL in Vault at deployment; no API/service key in cron SQL.
SELECT cron.schedule('wmu-burn-expiry','* * * * *','SELECT public.enqueue_due_content_burns()');
SELECT cron.schedule('wmu-burn-orphans','17 * * * *','SELECT public.enqueue_orphan_content_burns()');
SELECT cron.schedule('wmu-burn-worker','* * * * *',$cron$
  SELECT net.http_post(
    url:=(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='wmu_burn_project_url')||'/functions/v1/process-content-burns',
    headers:=jsonb_build_object('Content-Type','application/json','x-burn-worker-token',(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='wmu_burn_worker_token')),
    body:='{}'::jsonb,timeout_milliseconds:=55000
  ) WHERE EXISTS(SELECT 1 FROM vault.decrypted_secrets WHERE name='wmu_burn_project_url')
$cron$);
-- SCHEDULER END
NOTIFY pgrst,'reload schema';
COMMIT;
