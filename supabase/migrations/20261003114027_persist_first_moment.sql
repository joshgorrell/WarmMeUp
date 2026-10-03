BEGIN;

-- Freeze writes while installing triggers and collecting historical evidence.
LOCK TABLE public.couples, public.interactions, public.chat_messages,
  public.vault_items, public.wishes, public.activity_events IN SHARE ROW EXCLUSIVE MODE;

ALTER TABLE public.couples ADD COLUMN first_moment_completed_at timestamptz;
COMMENT ON COLUMN public.couples.first_moment_completed_at IS
  'Historical onboarding milestone for this pairing. Contains no content; survives burns.';
GRANT SELECT (first_moment_completed_at) ON public.couples TO authenticated;

-- Include soft-deleted content and retained aggregate/event evidence. Do not
-- guess from account age, pairing, or subscription state alone.
WITH evidence AS (
  SELECT couple_id, created_at FROM public.interactions
  UNION ALL SELECT couple_id, created_at FROM public.chat_messages
  UNION ALL SELECT couple_id, created_at FROM public.vault_items
  UNION ALL SELECT couple_id, created_at FROM public.wishes
  UNION ALL SELECT couple_id, created_at FROM public.activity_events
    WHERE event_type NOT IN ('partner_joined', 'content_deleted')
  UNION ALL SELECT couple_id, created_at FROM public.monthly_scores
    WHERE dares_accepted > 0 OR dares_completed > 0 OR dares_skipped > 0
      OR dice_accepted > 0 OR dice_completed > 0 OR dice_skipped > 0
      OR asks_sent > 0 OR asks_replied > 0 OR chat_messages_sent > 0
      OR media_sent > 0 OR vault_uploads > 0 OR wishes_sent > 0 OR wishes_fulfilled > 0
), first_moments AS (
  SELECT couple_id, min(created_at) AS completed_at FROM evidence GROUP BY couple_id
)
UPDATE public.couples c
SET first_moment_completed_at = coalesce(e.completed_at, now())
FROM first_moments e
WHERE c.id = e.couple_id AND c.active AND c.user_b_id IS NOT NULL;

-- Trigger-only function: a client's successful content insert records the
-- milestone in the same transaction, including writes from older app versions.
CREATE FUNCTION public.record_first_moment() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_TABLE_NAME = 'activity_events' THEN
    IF NEW.event_type IN ('partner_joined', 'content_deleted') THEN
      RETURN NEW;
    END IF;
  END IF;
  UPDATE public.couples
  SET first_moment_completed_at = now()
  WHERE id = NEW.couple_id AND active AND user_b_id IS NOT NULL
    AND first_moment_completed_at IS NULL
    AND ((SELECT auth.uid()) IS NULL OR (SELECT auth.uid()) IN (user_a_id, user_b_id));
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.record_first_moment() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER record_first_moment AFTER INSERT ON public.interactions
  FOR EACH ROW EXECUTE FUNCTION public.record_first_moment();
CREATE TRIGGER record_first_moment AFTER INSERT ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.record_first_moment();
CREATE TRIGGER record_first_moment AFTER INSERT ON public.vault_items
  FOR EACH ROW EXECUTE FUNCTION public.record_first_moment();
CREATE TRIGGER record_first_moment AFTER INSERT ON public.wishes
  FOR EACH ROW EXECUTE FUNCTION public.record_first_moment();
CREATE TRIGGER record_first_moment AFTER INSERT ON public.activity_events
  FOR EACH ROW EXECUTE FUNCTION public.record_first_moment();

CREATE FUNCTION public.preserve_first_moment() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.first_moment_completed_at := NULL;
  ELSIF NEW.user_a_id IS DISTINCT FROM OLD.user_a_id
     OR NEW.user_b_id IS DISTINCT FROM OLD.user_b_id
     OR NOT NEW.active
     OR NEW.disconnected_at IS DISTINCT FROM OLD.disconnected_at THEN
    NEW.first_moment_completed_at := NULL;
  ELSIF OLD.first_moment_completed_at IS NOT NULL THEN
    NEW.first_moment_completed_at := OLD.first_moment_completed_at;
  ELSIF pg_trigger_depth() = 1 THEN
    -- Only content-insert triggers can establish the milestone.
    NEW.first_moment_completed_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.preserve_first_moment() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER preserve_first_moment BEFORE INSERT OR UPDATE ON public.couples
  FOR EACH ROW EXECUTE FUNCTION public.preserve_first_moment();

NOTIFY pgrst, 'reload schema';
COMMIT;
