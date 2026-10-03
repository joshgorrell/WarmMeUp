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

NOTIFY pgrst, 'reload schema';
