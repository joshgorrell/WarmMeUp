/*
# Dare Action Completion Upgrade

## Purpose
Upgrades the Dare feature so that accepting a Dare is no longer always the
final action. When creating a Dare, the sender selects an action type
(photo, video, message, or action). After the recipient accepts, the Dare
remains active until the corresponding completion event occurs.

## State Flow
- Legacy dares (no action_type): sent -> seen -> accepted (terminal, unchanged)
- Action dares: sent -> seen -> accepted -> completed
  - Accepted dares with an action_type stay is_active = true until completed
  - Completion events: photo/video vault upload, message chat send, or action tap

## Schema Changes

### 1. New columns on `interactions`
- `action_type` text — what the sender requests: 'photo' | 'video' | 'message' | 'action'
  Nullable for backward compatibility with existing dares.
- `completion_type` text — what actually completed the dare: same values as action_type.
  Populated when the dare is completed.
- `completed_by_user_id` uuid — who completed the dare (the receiver).
- `vault_item_id` uuid — for photo/video completions, references vault_items.id.
- `dare_chat_message_id` uuid — for message completions, references chat_messages.id.

### 2. New column on `chat_messages`
- `dare_interaction_id` uuid — when a chat message is sent as a dare response,
  this carries the dare's interaction ID so the message is linked to the dare.
  Nullable; only set when entering Chat from a Message Dare completion flow.

### 3. Updated `create_dare` RPC
- New parameter `p_action_type text` (nullable for backward compat).
- Stores the action_type on the new dare row.

### 4. New `complete_dare` RPC
- Idempotent: only transitions accepted -> completed.
- Sets completion_type, completed_by_user_id, completed_at, vault_item_id or
  dare_chat_message_id as provided.
- Returns the updated row as JSONB.
- Awards dare_complete points to the completing user (caller-side, not in RPC,
  to reuse existing points.ts logic).

### 5. Updated state machine guard
- Allows `accepted -> completed` for dares that have an action_type.
- Keeps `accepted` terminal for legacy dares (no action_type).
- Only the receiver can complete a dare.

### 6. Updated expire functions
- `expire_overdue_dares()` and `expire_dares_trigger_fn()` continue to only
  expire `sent` and `seen` dares. Accepted dares with action_type are NOT expired.

### 7. Point config
- `dare_accept` set to 0 (acceptance alone no longer awards full points).
- `dare_complete` set to 30 (completion awards the full points).
- Total remains 30, but only awarded on actual completion.

### 8. Column privileges
- Grant UPDATE on new interactions columns to authenticated.
- Grant UPDATE on new chat_messages column to authenticated.

## Security
- No RLS policy changes needed — existing couple-scoped policies cover the new columns.
- `complete_dare` RPC is SECURITY DEFINER with pinned search_path.
- State machine guard remains SECURITY DEFINER with pinned search_path.
- Only the receiver can complete a dare (enforced in both RPC and guard).

## Notes
1. Existing dares without action_type continue to work with accept-is-final behavior.
2. The dare creation screen requires action type selection for new dares.
3. Completion is idempotent — a conditional UPDATE ensures no double-award.
4. Photo/video completions reference the vault_item; no duplicate media is stored.
5. Message completions reference the chat_message via dare_chat_message_id.
*/

-- ─── 1. Add new columns to interactions ──────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'interactions' AND column_name = 'action_type') THEN
    ALTER TABLE public.interactions ADD COLUMN action_type text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'interactions' AND column_name = 'completion_type') THEN
    ALTER TABLE public.interactions ADD COLUMN completion_type text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'interactions' AND column_name = 'completed_by_user_id') THEN
    ALTER TABLE public.interactions ADD COLUMN completed_by_user_id uuid;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'interactions' AND column_name = 'vault_item_id') THEN
    ALTER TABLE public.interactions ADD COLUMN vault_item_id uuid;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'interactions' AND column_name = 'dare_chat_message_id') THEN
    ALTER TABLE public.interactions ADD COLUMN dare_chat_message_id uuid;
  END IF;
END $$;

-- ─── 2. Add dare_interaction_id to chat_messages ─────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chat_messages' AND column_name = 'dare_interaction_id') THEN
    ALTER TABLE public.chat_messages ADD COLUMN dare_interaction_id uuid;
  END IF;
END $$;

-- ─── 3. Grant column privileges ──────────────────────────────────────────
GRANT UPDATE (action_type, completion_type, completed_by_user_id, vault_item_id, dare_chat_message_id)
  ON public.interactions TO authenticated;

GRANT UPDATE (dare_interaction_id) ON public.chat_messages TO authenticated;

-- ─── 4. Update create_dare RPC ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_dare(
  p_couple_id uuid,
  p_content_text text,
  p_duration_seconds integer,
  p_action_type text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_sender_id uuid := auth.uid();
  v_receiver_id uuid;
  v_couple record;
  v_allowed_durations integer[] := ARRAY[900, 1800, 3600, 10800, 21600, 86400];
  v_allowed_action_types text[] := ARRAY['photo', 'video', 'message', 'action'];
  v_new_id uuid;
  v_created_at timestamptz;
  v_expires_at timestamptz;
BEGIN
  IF v_sender_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF p_duration_seconds IS NULL OR NOT (p_duration_seconds = ANY(v_allowed_durations)) THEN
    RAISE EXCEPTION 'Invalid dare duration: %', p_duration_seconds USING ERRCODE = '22023';
  END IF;

  IF p_action_type IS NOT NULL AND NOT (p_action_type = ANY(v_allowed_action_types)) THEN
    RAISE EXCEPTION 'Invalid action type: %', p_action_type USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_couple
  FROM couples
  WHERE id = p_couple_id
    AND active = true
    AND (user_a_id = v_sender_id OR user_b_id = v_sender_id);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorized for this couple' USING ERRCODE = '42501';
  END IF;

  IF v_couple.user_a_id = v_sender_id THEN
    v_receiver_id := v_couple.user_b_id;
  ELSE
    v_receiver_id := v_couple.user_a_id;
  END IF;

  IF v_receiver_id IS NULL THEN
    RAISE EXCEPTION 'No paired partner to send dare to' USING ERRCODE = '22004';
  END IF;

  UPDATE interactions
  SET is_active = false, status = 'cancelled'
  WHERE couple_id = p_couple_id
    AND sender_id = v_sender_id
    AND deleted_at IS NULL
    AND status IN ('sent', 'seen', 'accepted')
    AND type IN ('dice', 'dare', 'tell_me');

  v_new_id := gen_random_uuid();
  v_created_at := now();
  v_expires_at := v_created_at + make_interval(secs => p_duration_seconds);

  INSERT INTO interactions (
    id, couple_id, type, sender_id, receiver_id,
    content_text, status, is_active,
    created_at, expires_at, action_type
  ) VALUES (
    v_new_id, p_couple_id, 'dare', v_sender_id, v_receiver_id,
    p_content_text, 'sent', true,
    v_created_at, v_expires_at, p_action_type
  );

  RETURN jsonb_build_object(
    'id', v_new_id,
    'couple_id', p_couple_id,
    'type', 'dare',
    'sender_id', v_sender_id,
    'receiver_id', v_receiver_id,
    'content_text', p_content_text,
    'status', 'sent',
    'is_active', true,
    'action_type', p_action_type,
    'created_at', v_created_at,
    'expires_at', v_expires_at
  );
END;
$$;

-- ─── 5. Create complete_dare RPC ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.complete_dare(
  p_interaction_id uuid,
  p_completion_type text DEFAULT NULL,
  p_vault_item_id uuid DEFAULT NULL,
  p_chat_message_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_interaction record;
  v_caller_id uuid := auth.uid();
  v_now timestamptz := now();
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_interaction
  FROM interactions
  WHERE id = p_interaction_id
    AND deleted_at IS NULL
    AND type = 'dare';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Dare not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_interaction.receiver_id != v_caller_id THEN
    RAISE EXCEPTION 'Only the receiver can complete a dare' USING ERRCODE = '42501';
  END IF;

  IF v_interaction.status != 'accepted' THEN
    RETURN jsonb_build_object('already_completed', true, 'id', p_interaction_id, 'status', v_interaction.status);
  END IF;

  UPDATE interactions
  SET status = 'completed',
      is_active = false,
      completed_at = v_now,
      completion_type = COALESCE(p_completion_type, v_interaction.action_type, 'action'),
      completed_by_user_id = v_caller_id,
      vault_item_id = COALESCE(p_vault_item_id, vault_item_id),
      dare_chat_message_id = COALESCE(p_chat_message_id, dare_chat_message_id)
  WHERE id = p_interaction_id
    AND status = 'accepted';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('already_completed', true, 'id', p_interaction_id);
  END IF;

  SELECT * INTO v_interaction FROM interactions WHERE id = p_interaction_id;

  RETURN jsonb_build_object(
    'id', v_interaction.id,
    'status', 'completed',
    'completion_type', v_interaction.completion_type,
    'completed_by_user_id', v_interaction.completed_by_user_id,
    'completed_at', v_interaction.completed_at,
    'vault_item_id', v_interaction.vault_item_id,
    'dare_chat_message_id', v_interaction.dare_chat_message_id,
    'already_completed', false
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_dare(uuid, text, uuid, uuid) TO authenticated;

-- ─── 6. Update state machine guard ───────────────────────────────────────
-- Drop trigger temporarily
DROP TRIGGER IF EXISTS guard_interaction_status_transition_trigger ON public.interactions;

CREATE OR REPLACE FUNCTION public.guard_interaction_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  old_status text;
  new_status text;
  caller_uid uuid;
  is_sender boolean;
  is_receiver boolean;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    RETURN NEW;
  END IF;

  old_status := OLD.status;
  new_status := NEW.status;
  caller_uid := auth.uid();
  is_sender := (OLD.sender_id = caller_uid);
  is_receiver := (OLD.receiver_id = caller_uid);

  -- Time-based expiry: sent/seen -> expired (no ownership check)
  IF new_status = 'expired'
     AND old_status IN ('sent', 'seen')
  THEN
    RETURN NEW;
  END IF;

  IF old_status = 'sent' AND new_status = 'seen' THEN
    IF NOT is_receiver THEN
      RAISE EXCEPTION 'Only the receiver can mark a challenge as seen'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF old_status = 'seen' AND new_status = 'accepted' THEN
    IF NOT is_receiver THEN
      RAISE EXCEPTION 'Only the receiver can accept a challenge'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF old_status = 'seen' AND new_status = 'rejected' THEN
    IF NOT is_receiver THEN
      RAISE EXCEPTION 'Only the receiver can reject a challenge'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF old_status = 'seen' AND new_status = 'cancelled' THEN
    IF NOT is_sender THEN
      RAISE EXCEPTION 'Only the sender can cancel a challenge'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF old_status = 'seen' AND new_status = 'pending_verification' THEN
    IF NOT is_receiver THEN
      RAISE EXCEPTION 'Only the receiver can report completion'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF old_status = 'sent' AND new_status = 'accepted' THEN
    IF NOT is_receiver THEN
      RAISE EXCEPTION 'Only the receiver can accept a challenge'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF old_status = 'sent' AND new_status = 'rejected' THEN
    IF NOT is_receiver THEN
      RAISE EXCEPTION 'Only the receiver can reject a challenge'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF old_status = 'sent' AND new_status = 'cancelled' THEN
    IF NOT is_sender THEN
      RAISE EXCEPTION 'Only the sender can cancel a challenge'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- accepted -> pending_verification: ONLY for dice, NOT for dares
  IF old_status = 'accepted' AND new_status = 'pending_verification' THEN
    IF OLD.type = 'dare' THEN
      RAISE EXCEPTION 'Dares cannot transition to pending verification after acceptance'
        USING ERRCODE = '44000';
    END IF;
    IF NOT is_receiver THEN
      RAISE EXCEPTION 'Only the receiver can report completion'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- accepted -> completed: ONLY for dares with an action_type, receiver only
  IF old_status = 'accepted' AND new_status = 'completed' THEN
    IF OLD.type = 'dare' AND OLD.action_type IS NOT NULL THEN
      IF NOT is_receiver THEN
        RAISE EXCEPTION 'Only the receiver can complete a dare'
          USING ERRCODE = '42501';
      END IF;
      RETURN NEW;
    END IF;
    -- Legacy dares (no action_type) cannot transition accepted -> completed
    -- They are terminal at accepted
    IF OLD.type = 'dare' AND OLD.action_type IS NULL THEN
      RAISE EXCEPTION 'Legacy dares cannot be completed after acceptance'
        USING ERRCODE = '44000';
    END IF;
  END IF;

  IF old_status = 'accepted' AND new_status = 'rejected' THEN
    IF NOT is_receiver THEN
      RAISE EXCEPTION 'Only the receiver can reject a challenge'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF old_status = 'pending_verification' AND new_status = 'completed' THEN
    IF NOT is_sender THEN
      RAISE EXCEPTION 'Only the sender can verify completion'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF old_status = 'pending_verification' AND new_status = 'rejected' THEN
    IF NOT is_sender THEN
      RAISE EXCEPTION 'Only the sender can reject a pending verification'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Invalid status transition from % to %', old_status, new_status
    USING ERRCODE = '44000';
END;
$$;

-- Recreate the guard trigger
CREATE TRIGGER guard_interaction_status_transition_trigger
  BEFORE UPDATE ON public.interactions
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_interaction_status_transition();

-- ─── 7. Update expire functions (no change needed, but reassert) ─────────
CREATE OR REPLACE FUNCTION public.expire_overdue_dares()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE interactions
  SET status = 'expired',
      is_active = false
  WHERE type = 'dare'
    AND deleted_at IS NULL
    AND expires_at IS NOT NULL
    AND expires_at < now()
    AND status IN ('sent', 'seen');
END;
$$;

GRANT EXECUTE ON FUNCTION public.expire_overdue_dares() TO authenticated;

CREATE OR REPLACE FUNCTION public.expire_dares_trigger_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.type = 'dare'
     AND NEW.deleted_at IS NULL
     AND NEW.expires_at IS NOT NULL
     AND NEW.expires_at < now()
     AND NEW.status IN ('sent', 'seen')
  THEN
    NEW.status := 'expired';
    NEW.is_active := false;
  END IF;
  RETURN NEW;
END;
$$;

-- ─── 8. Update point config ──────────────────────────────────────────────
INSERT INTO point_config (event_key, label, points)
VALUES ('dare_accept', 'Dare accepted', 0)
ON CONFLICT (event_key) DO UPDATE SET points = 0;

INSERT INTO point_config (event_key, label, points)
VALUES ('dare_complete', 'Dare completed', 30)
ON CONFLICT (event_key) DO UPDATE SET points = 30;

-- ─── 9. Add index for dare_interaction_id lookups ────────────────────────
CREATE INDEX IF NOT EXISTS idx_chat_messages_dare_interaction_id
  ON public.chat_messages (dare_interaction_id)
  WHERE dare_interaction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_interactions_action_type
  ON public.interactions (couple_id, type, action_type)
  WHERE deleted_at IS NULL AND action_type IS NOT NULL;
