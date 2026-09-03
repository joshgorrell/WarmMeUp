/*
# Fix Chat Activity Status Trigger and Backfill

## Purpose
1. Fix the `update_chat_activity_status()` function which had a syntax issue
   in the JSON parsing.
2. Backfill existing chat activity messages for dares with the current dare
   status so accepted/expired dares show correctly in the chat feed.

## Changes
- Recreate `update_chat_activity_status()` with correct JSON parsing.
- Bulk update existing chat activity messages to include `dareStatus` from
  the corresponding interaction row.
*/

-- Fix the function with correct JSON parsing
CREATE OR REPLACE FUNCTION public.update_chat_activity_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  msg_id uuid;
  old_payload text;
  new_payload text;
  payload_json jsonb;
BEGIN
  -- Only process dare and dice, and only when status actually changed
  IF NEW.type NOT IN ('dare', 'dice') THEN RETURN NEW; END IF;
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;

  -- Find the chat activity message for this interaction
  SELECT id, content_text INTO msg_id, old_payload
  FROM chat_messages
  WHERE content_text LIKE '__WMU_ACTIVITY__:%'
    AND content_text LIKE '%' || NEW.id::text || '%'
    AND deleted_at IS NULL
  ORDER BY created_at ASC
  LIMIT 1;

  IF msg_id IS NULL THEN RETURN NEW; END IF;

  -- Parse the existing payload, add dareStatus, and update
  BEGIN
    payload_json := substring(old_payload from '__WMU_ACTIVITY__:(.*)$')::jsonb;
  EXCEPTION WHEN OTHERS THEN
    RETURN NEW;
  END;

  payload_json := payload_json || jsonb_build_object('dareStatus', NEW.status);
  new_payload := '__WMU_ACTIVITY__:' || payload_json::text;

  UPDATE chat_messages
  SET content_text = new_payload
  WHERE id = msg_id;

  RETURN NEW;
END;
$$;

-- Backfill existing chat activity messages with dare status
DO $$
DECLARE
  msg_record RECORD;
  payload_json jsonb;
  new_payload text;
  interaction_status text;
BEGIN
  FOR msg_record IN
    SELECT m.id, m.content_text,
           substring(m.content_text from '"sourceId": "([^"]+)"') AS source_id
    FROM chat_messages m
    WHERE m.content_text LIKE '__WMU_ACTIVITY__:%'
      AND m.content_text LIKE '%"kind": "dare"%'
      AND m.deleted_at IS NULL
  LOOP
    -- Get the interaction status
    SELECT status INTO interaction_status
    FROM interactions
    WHERE id = msg_record.source_id::uuid;

    IF interaction_status IS NULL THEN CONTINUE; END IF;

    -- Parse payload, add dareStatus
    BEGIN
      payload_json := substring(msg_record.content_text from '__WMU_ACTIVITY__:(.*)$')::jsonb;
      payload_json := payload_json || jsonb_build_object('dareStatus', interaction_status);
      new_payload := '__WMU_ACTIVITY__:' || payload_json::text;

      UPDATE chat_messages
      SET content_text = new_payload
      WHERE id = msg_record.id;
    EXCEPTION WHEN OTHERS THEN
      CONTINUE;
    END;
  END LOOP;
END;
$$;
