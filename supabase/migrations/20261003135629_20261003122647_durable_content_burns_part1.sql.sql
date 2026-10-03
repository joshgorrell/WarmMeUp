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
  IF p_bucket NOT IN ('chat_media','vault') OR split_part(p_path,'/',1)<>p_couple::text
    OR p_path LIKE '%://%' OR p_path ~ '(^|/)\.\.(/|$)' THEN
    RAISE EXCEPTION 'Invalid owned media path';
  END IF;
  INSERT INTO content_burn_objects VALUES(p_job,p_bucket,p_path) ON CONFLICT DO NOTHING;
  IF p_path ~ '_thumb\.jpg$' THEN RETURN; END IF;
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

NOTIFY pgrst, 'reload schema';
