/*
# Tighten handle_new_profile_subscription trial suppression logic

## Summary
Updates the trial suppression logic in handle_new_profile_subscription to
validate the pending invite code directly against the couples table rather
than calling preview_invite. The trial is now suppressed ONLY when the invite
code positively maps to a currently joinable solo couple.

## Logic
1. No pending_invite_code in metadata → create normal 7-day trial
2. Pending code maps to an active solo couple with user_b_id IS NULL and
   user_a_id != NEW.id → suppress trial (this is a valid invited User B)
3. Pending code is not found, stale, expired, or maps to the caller's own
   couple → create normal 7-day trial
4. Unexpected database exception → log and create normal 7-day trial
   (conservative: do not classify as invited partner solely because
   validation failed)

## Security
- No RLS changes, no new tables/columns.
- Function remains SECURITY DEFINER with pinned search_path.
- Direct table validation avoids dependency on preview_invite and its
  rate-limiting side effects.
*/

CREATE OR REPLACE FUNCTION public.handle_new_profile_subscription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_pending_code text;
  v_invite_couple_id uuid;
  v_invite_user_a  uuid;
BEGIN
  -- Check if this signup originated from a pending invite.
  -- The client passes pending_invite_code in auth metadata during signUp.
  SELECT raw_user_meta_data->>'pending_invite_code'
  INTO v_pending_code
  FROM auth.users
  WHERE id = NEW.id;

  v_pending_code := NULLIF(v_pending_code, '');

  -- If there's a pending invite code, validate it directly against the couples
  -- table. The trial is suppressed ONLY when the code positively maps to a
  -- currently joinable solo couple owned by a different user.
  IF v_pending_code IS NOT NULL THEN
    BEGIN
      -- Direct validation: find an active solo couple with this invite code
      -- that is still joinable (user_b_id IS NULL, active = true, not expired,
      -- and not owned by the new user themselves).
      SELECT c.id, c.user_a_id
      INTO v_invite_couple_id, v_invite_user_a
      FROM public.couples c
      WHERE c.invite_code = v_pending_code
        AND c.user_b_id IS NULL
        AND c.active = true
        AND c.user_a_id <> NEW.id
        AND (c.invite_code_expires_at IS NULL
             OR c.invite_code_expires_at > now())
      LIMIT 1;

      IF v_invite_couple_id IS NOT NULL THEN
        -- Positively validated: this user is joining as User B.
        -- Suppress the standalone trial — they will inherit couple access.
        RETURN NEW;
      END IF;

      -- Code is definitively invalid/stale/not joinable, or it's the caller's
      -- own code. Fall through to create a normal trial.
    EXCEPTION WHEN OTHERS THEN
      -- Unexpected database error during validation. Log it and create a
      -- normal trial — do NOT classify the account as an invited partner
      -- solely because validation failed.
      INSERT INTO public.debug_events (event_type, event_data, created_at)
      VALUES (
        'trial_suppression_validation_error',
        jsonb_build_object(
          'user_id', NEW.id,
          'pending_code', v_pending_code,
          'error', SQLERRM
        ),
        now()
      )
      ON CONFLICT DO NOTHING;
      -- Fall through to normal trial creation.
    END;
  END IF;

  -- Normal solo signup or definitively invalid invite — create the 7-day trial.
  INSERT INTO public.subscriptions (user_id, plan, status, trial_started_at, started_at, expires_at)
  VALUES (
    NEW.id,
    'trial',
    'active',
    now(),
    now(),
    now() + interval '7 days'
  )
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$function$;
