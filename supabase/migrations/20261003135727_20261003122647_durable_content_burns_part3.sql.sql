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
  INSERT INTO content_burn_objects SELECT j,o.bucket,o.path FROM content_burn_objects o JOIN content_burn_jobs old ON old.id=o.job_id WHERE old.couple_id=p_couple AND old.state='pending' AND old.id<>j ON CONFLICT DO NOTHING;
  INSERT INTO couple_content_changes(couple_id,revision) VALUES(p_couple,1) ON CONFLICT(couple_id) DO UPDATE SET revision=couple_content_changes.revision+1;
  RETURN j;
END $$;

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

NOTIFY pgrst, 'reload schema';
