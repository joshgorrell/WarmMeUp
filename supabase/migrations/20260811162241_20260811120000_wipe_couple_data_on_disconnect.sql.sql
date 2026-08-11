/*
# Wipe All Shared Couple Data on Partner Disconnection

## Purpose
When a couple breaks up (disconnects), ALL shared relationship content must be
permanently destroyed so neither user can walk away with the other's data.
Previously the disconnect flow only deactivated the couple record — all chat
messages, photos, videos, dares, dice rolls, wishes, vault items, points, and
activity history remained in the database and storage buckets.

## Changes

### 1. New SECURITY DEFINER function: wipe_couple_data(p_couple_id, p_user_id)
- Verifies the caller (p_user_id) is a member of the couple (user_a or user_b)
- Atomically deletes all couple-scoped shared data:
  - chat_messages
  - media_reactions
  - interactions (dice, dares, tell_me)
  - wishes
  - vault_items
  - activity_events
  - activity_views
  - cash_in_events
  - point_events
  - monthly_scores
  - couple_hidden_prompts
  - couple_custom_prompts (if table exists)
- Resets scores to zero for the couple
- Deactivates the couple: active=false, user_b_id=null, disconnected_at=now(),
  subscription_owner_id=null, invite_code=null
- Resets celebration_seen=false for both users so re-pairing shows celebration
- Returns a JSON object with the count of deleted rows per table
- Security: SECURITY DEFINER, search_path pinned to public, execute revoked
  from anon and public, granted only to authenticated

### 2. Security
- Function is SECURITY DEFINER so it can delete from all couple-scoped tables
  regardless of RLS policies
- search_path is pinned to public to prevent injection
- Execute is revoked from PUBLIC and anon, granted only to authenticated
- The function verifies the caller is a couple member before wiping

### 3. Idempotent
- Safe to re-run; uses IF EXISTS checks where needed
- Function can be called multiple times safely (second call finds no data)
*/

-- ─── 1. Create wipe_couple_data function ─────────────────────────────────────

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
  GET DIAGNOSTICS v_counts = ROW_COUNT;
  v_counts := jsonb_set(v_counts, '{chat_messages}', to_jsonb(v_counts));

  DELETE FROM public.media_reactions WHERE couple_id = p_couple_id;
  GET DIAGNOSTICS v_counts = ROW_COUNT;
  v_counts := jsonb_set(v_counts, '{media_reactions}', to_jsonb(v_counts));

  DELETE FROM public.interactions WHERE couple_id = p_couple_id;
  GET DIAGNOSTICS v_counts = ROW_COUNT;
  v_counts := jsonb_set(v_counts, '{interactions}', to_jsonb(v_counts));

  DELETE FROM public.wishes WHERE couple_id = p_couple_id;
  GET DIAGNOSTICS v_counts = ROW_COUNT;
  v_counts := jsonb_set(v_counts, '{wishes}', to_jsonb(v_counts));

  DELETE FROM public.vault_items WHERE couple_id = p_couple_id;
  GET DIAGNOSTICS v_counts = ROW_COUNT;
  v_counts := jsonb_set(v_counts, '{vault_items}', to_jsonb(v_counts));

  DELETE FROM public.activity_events WHERE couple_id = p_couple_id;
  GET DIAGNOSTICS v_counts = ROW_COUNT;
  v_counts := jsonb_set(v_counts, '{activity_events}', to_jsonb(v_counts));

  DELETE FROM public.activity_views WHERE couple_id = p_couple_id;
  GET DIAGNOSTICS v_counts = ROW_COUNT;
  v_counts := jsonb_set(v_counts, '{activity_views}', to_jsonb(v_counts));

  DELETE FROM public.cash_in_events WHERE couple_id = p_couple_id;
  GET DIAGNOSTICS v_counts = ROW_COUNT;
  v_counts := jsonb_set(v_counts, '{cash_in_events}', to_jsonb(v_counts));

  DELETE FROM public.point_events WHERE couple_id = p_couple_id;
  GET DIAGNOSTICS v_counts = ROW_COUNT;
  v_counts := jsonb_set(v_counts, '{point_events}', to_jsonb(v_counts));

  DELETE FROM public.monthly_scores WHERE couple_id = p_couple_id;
  GET DIAGNOSTICS v_counts = ROW_COUNT;
  v_counts := jsonb_set(v_counts, '{monthly_scores}', to_jsonb(v_counts));

  -- Reset scores to zero (scores table has per-user rows, not deletable per couple)
  UPDATE public.scores SET points = 0 WHERE couple_id = p_couple_id;
  GET DIAGNOSTICS v_counts = ROW_COUNT;
  v_counts := jsonb_set(v_counts, '{scores_reset}', to_jsonb(v_counts));

  -- Delete couple-scoped prompt customizations
  DELETE FROM public.couple_hidden_prompts WHERE couple_id = p_couple_id;
  GET DIAGNOSTICS v_counts = ROW_COUNT;
  v_counts := jsonb_set(v_counts, '{couple_hidden_prompts}', to_jsonb(v_counts));

  -- couple_custom_prompts may not exist on all projects — check first
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'couple_custom_prompts'
  ) INTO v_table_exists;

  IF v_table_exists THEN
    DELETE FROM public.couple_custom_prompts WHERE couple_id = p_couple_id;
    GET DIAGNOSTICS v_counts = ROW_COUNT;
    v_counts := jsonb_set(v_counts, '{couple_custom_prompts}', to_jsonb(v_counts));
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

-- ─── 2. Revoke and grant execute ─────────────────────────────────────────────

REVOKE ALL ON FUNCTION public.wipe_couple_data(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.wipe_couple_data(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.wipe_couple_data(uuid, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
