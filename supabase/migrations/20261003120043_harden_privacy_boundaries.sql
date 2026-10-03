BEGIN;

-- Keep numeric row counts separate from the JSON result accumulator.
CREATE OR REPLACE FUNCTION public.wipe_couple_data(p_couple_id uuid, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_user_a_id   uuid;
  v_user_b_id   uuid;
  v_counts      jsonb := '{}'::jsonb;
  v_row_count integer;
  v_table_exists boolean;
BEGIN
  -- Verify the couple exists and the caller is a member
  SELECT user_a_id, user_b_id
    INTO v_user_a_id, v_user_b_id
    FROM public.couples
    WHERE id = p_couple_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Couple not found' USING ERRCODE = 'P0001';
  END IF;

  IF p_user_id IS DISTINCT FROM v_user_a_id AND p_user_id IS DISTINCT FROM v_user_b_id THEN
    RAISE EXCEPTION 'Not a member of this couple' USING ERRCODE = 'P0003';
  END IF;

  -- ── Delete couple-scoped shared data ──

  DELETE FROM public.chat_messages WHERE couple_id = p_couple_id;
  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  v_counts := jsonb_set(v_counts, '{chat_messages}', to_jsonb(v_row_count));

  DELETE FROM public.media_reactions WHERE couple_id = p_couple_id;
  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  v_counts := jsonb_set(v_counts, '{media_reactions}', to_jsonb(v_row_count));

  DELETE FROM public.interactions WHERE couple_id = p_couple_id;
  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  v_counts := jsonb_set(v_counts, '{interactions}', to_jsonb(v_row_count));

  DELETE FROM public.wishes WHERE couple_id = p_couple_id;
  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  v_counts := jsonb_set(v_counts, '{wishes}', to_jsonb(v_row_count));

  DELETE FROM public.vault_items WHERE couple_id = p_couple_id;
  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  v_counts := jsonb_set(v_counts, '{vault_items}', to_jsonb(v_row_count));

  DELETE FROM public.activity_events WHERE couple_id = p_couple_id;
  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  v_counts := jsonb_set(v_counts, '{activity_events}', to_jsonb(v_row_count));

  DELETE FROM public.activity_views WHERE couple_id = p_couple_id;
  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  v_counts := jsonb_set(v_counts, '{activity_views}', to_jsonb(v_row_count));

  DELETE FROM public.cash_in_events WHERE couple_id = p_couple_id;
  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  v_counts := jsonb_set(v_counts, '{cash_in_events}', to_jsonb(v_row_count));

  DELETE FROM public.point_events WHERE couple_id = p_couple_id;
  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  v_counts := jsonb_set(v_counts, '{point_events}', to_jsonb(v_row_count));

  DELETE FROM public.monthly_scores WHERE couple_id = p_couple_id;
  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  v_counts := jsonb_set(v_counts, '{monthly_scores}', to_jsonb(v_row_count));

  -- Reset scores to zero (scores table has per-user rows, not deletable per couple)
  UPDATE public.scores SET points = 0 WHERE couple_id = p_couple_id;
  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  v_counts := jsonb_set(v_counts, '{scores_reset}', to_jsonb(v_row_count));

  -- Delete couple-scoped prompt customizations
  DELETE FROM public.couple_hidden_prompts WHERE couple_id = p_couple_id;
  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  v_counts := jsonb_set(v_counts, '{couple_hidden_prompts}', to_jsonb(v_row_count));

  -- couple_custom_prompts may not exist on all projects — check first
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'couple_custom_prompts'
  ) INTO v_table_exists;

  IF v_table_exists THEN
    DELETE FROM public.couple_custom_prompts WHERE couple_id = p_couple_id;
    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    v_counts := jsonb_set(v_counts, '{couple_custom_prompts}', to_jsonb(v_row_count));
  END IF;

  -- ── Deactivate the couple ──
  UPDATE public.couples
    SET active = false,
        user_b_id = null,
        disconnected_at = now(),
        subscription_owner_id = null,
        invite_code = null
    WHERE id = p_couple_id;

  -- ── Reset celebration flag for both users ──
  UPDATE public.user_settings
    SET celebration_seen = false
    WHERE user_id IN (v_user_a_id, v_user_b_id)
      AND user_id IS NOT NULL;

  RETURN jsonb_build_object(
    'ok', true,
    'couple_id', p_couple_id,
    'deleted', v_counts,
    'disconnected_at', now()
  );
END;
$$;

-- The authenticated Edge Function verifies its caller and invokes this with
-- the service role. A client-supplied p_user_id is not authentication.
REVOKE ALL ON FUNCTION public.wipe_couple_data(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wipe_couple_data(uuid, uuid) TO service_role;

-- This maintenance function can update content across all couples.
REVOKE ALL ON FUNCTION public.cleanup_orphaned_wish_activity() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_orphaned_wish_activity() TO service_role;

-- Restrictive policies intersect all existing permissive policies, so a
-- future accidental broad policy cannot bypass the active-couple boundary.
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'chat_messages', 'interactions', 'vault_items', 'wishes',
    'media_reactions', 'activity_events', 'activity_views',
    'point_events', 'monthly_scores', 'scores', 'cash_in_events'
  ] LOOP
    EXECUTE format('CREATE POLICY active_couple_privacy_boundary ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.couples c WHERE c.id = %I.couple_id AND c.active AND auth.uid() IN (c.user_a_id,c.user_b_id))) WITH CHECK (EXISTS (SELECT 1 FROM public.couples c WHERE c.id = %I.couple_id AND c.active AND auth.uid() IN (c.user_a_id,c.user_b_id)))', table_name, table_name, table_name);
  END LOOP;
END;
$$;

-- Events may refer only to people and source records in this couple.
CREATE POLICY activity_event_reference_boundary ON public.activity_events
AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (
  actor_user_id = auth.uid()
  AND EXISTS (SELECT 1 FROM public.couples c WHERE c.id = activity_events.couple_id
    AND c.active AND target_user_id IN (c.user_a_id,c.user_b_id))
  AND (vault_item_id IS NULL OR EXISTS (SELECT 1 FROM public.vault_items v
    WHERE v.id = activity_events.vault_item_id AND v.couple_id = activity_events.couple_id AND v.deleted_at IS NULL))
  AND (wish_id IS NULL OR EXISTS (SELECT 1 FROM public.wishes w
    WHERE w.id = activity_events.wish_id AND w.couple_id = activity_events.couple_id))
);
REVOKE UPDATE ON public.activity_events FROM authenticated;
GRANT UPDATE (read) ON public.activity_events TO authenticated;

-- A direct insert must not invent a paired relationship and reveal a
-- stranger's partner profile; actual pairing goes through verified RPCs.
REVOKE INSERT ON public.couples FROM authenticated;
GRANT INSERT (user_a_id) ON public.couples TO authenticated;

-- Private buckets must stay private even if older configuration drifted.
UPDATE storage.buckets SET public = false WHERE id IN ('chat_media', 'vault');
REVOKE SELECT, INSERT, UPDATE, DELETE ON storage.objects FROM anon;
CREATE POLICY active_shared_media_boundary ON storage.objects
AS RESTRICTIVE FOR ALL TO authenticated
USING (bucket_id NOT IN ('chat_media', 'vault') OR EXISTS (
  SELECT 1 FROM public.couples c WHERE c.id::text = (storage.foldername(name))[1]
    AND c.active AND auth.uid() IN (c.user_a_id,c.user_b_id)
))
WITH CHECK (bucket_id NOT IN ('chat_media', 'vault') OR EXISTS (
  SELECT 1 FROM public.couples c WHERE c.id::text = (storage.foldername(name))[1]
    AND c.active AND auth.uid() IN (c.user_a_id,c.user_b_id)
));
-- Both partners can burn shared content. Uploader-only deletion left the
-- other partner's file behind while their database item disappeared.
CREATE POLICY couple_members_can_burn_shared_media ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id IN ('chat_media', 'vault') AND EXISTS (
  SELECT 1 FROM public.couples c WHERE c.id::text = (storage.foldername(name))[1]
    AND c.active AND auth.uid() IN (c.user_a_id,c.user_b_id)
));

NOTIFY pgrst, 'reload schema';
COMMIT;
