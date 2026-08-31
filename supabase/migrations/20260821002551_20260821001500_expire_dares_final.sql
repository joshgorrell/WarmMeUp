/*
# Expire overdue dares (final pass)

## Purpose
Dare interactions whose `expires_at` has passed were stuck in active
statuses (`sent`, `seen`, `accepted`, `pending_verification`) because:
  a) The `interactions_status_check` CHECK constraint did not include
     `expired`, `pending_verification`, or `cancelled` (all of which the
     app already uses — the constraint was silently out of sync).
  b) The `guard_interaction_status_transition` trigger had no `-> expired`
     transition.

This migration:

1. Drops and recreates `interactions_status_check` to include ALL statuses
   the app uses: `sent`, `seen`, `accepted`, `pending_verification`,
   `rejected`, `completed`, `answered`, `cancelled`, `expired`.
2. Updates `guard_interaction_status_transition()` to allow time-based
   expiry: any non-terminal status can transition to `expired` with no
   ownership check (expiry is automatic, not user-initiated).
3. Bulk-updates every existing overdue dare to `status = 'expired'`,
   `is_active = false`.
4. Creates a reusable `expire_overdue_dares()` SECURITY DEFINER function.
5. Adds a BEFORE INSERT OR UPDATE trigger `expire_dares_on_change` that
   auto-expires dare rows when their timer lapses.

## Tables affected
- `interactions` — CHECK constraint updated; overdue dares expired.

## Security
- No RLS policy changes.
- The state-machine guard allows `-> expired` from `sent`, `seen`,
  `accepted`, `pending_verification` with NO ownership check (safe because
  expiry is determined by `expires_at < now()`, not by the caller).
- `expire_overdue_dares()` is SECURITY DEFINER with pinned search_path,
  granted EXECUTE to `authenticated`.
- The auto-expire trigger is SECURITY DEFINER with pinned search_path.

## Notes
1. The bulk UPDATE excludes terminal statuses so completed/rejected/
   cancelled dares keep their earned points.
2. The auto-expire trigger fires BEFORE the guard trigger (alphabetical
   trigger ordering: `expire_dares_on_change` < `guard_interaction...`),
   setting `NEW.status = 'expired'` before the guard validates it.
3. `deleted_at IS NULL` ensures soft-deleted dares are not resurrected.
4. The auto-expire trigger is idempotent.
*/

-- 1. Update the CHECK constraint to include all statuses the app uses
ALTER TABLE public.interactions DROP CONSTRAINT IF EXISTS interactions_status_check;

ALTER TABLE public.interactions ADD CONSTRAINT interactions_status_check
  CHECK (status = ANY (ARRAY[
    'sent'::text, 'seen'::text, 'accepted'::text, 'pending_verification'::text,
    'rejected'::text, 'completed'::text, 'answered'::text,
    'cancelled'::text, 'expired'::text
  ]));

-- 2. Update the state machine guard to allow -> expired transitions
DROP TRIGGER IF EXISTS guard_interaction_status_transition_trigger ON public.interactions;

DROP FUNCTION IF EXISTS public.guard_interaction_status_transition();

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

  -- Time-based expiry: any non-terminal status -> expired (no ownership check)
  IF new_status = 'expired'
     AND old_status IN ('sent', 'seen', 'accepted', 'pending_verification')
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

  IF old_status = 'accepted' AND new_status = 'pending_verification' THEN
    IF NOT is_receiver THEN
      RAISE EXCEPTION 'Only the receiver can report completion'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
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

CREATE TRIGGER guard_interaction_status_transition_trigger
  BEFORE UPDATE ON public.interactions
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_interaction_status_transition();

-- 3. Bulk-expire all currently overdue dares
UPDATE interactions
SET status = 'expired',
    is_active = false
WHERE type = 'dare'
  AND deleted_at IS NULL
  AND expires_at IS NOT NULL
  AND expires_at < now()
  AND status NOT IN ('completed', 'rejected', 'cancelled', 'expired');

-- 4. Reusable cleanup function (idempotent)
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
    AND status NOT IN ('completed', 'rejected', 'cancelled', 'expired');
END;
$$;

GRANT EXECUTE ON FUNCTION public.expire_overdue_dares() TO authenticated;

-- 5. Auto-expire trigger (fires BEFORE the guard trigger due to alphabetical ordering)
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
     AND NEW.status NOT IN ('completed', 'rejected', 'cancelled', 'expired')
  THEN
    NEW.status := 'expired';
    NEW.is_active := false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS expire_dares_on_change ON interactions;

CREATE TRIGGER expire_dares_on_change
BEFORE INSERT OR UPDATE ON interactions
FOR EACH ROW
EXECUTE FUNCTION public.expire_dares_trigger_fn();