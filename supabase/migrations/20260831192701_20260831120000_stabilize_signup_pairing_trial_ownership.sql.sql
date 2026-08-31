/*
# Stabilize Signup, Pairing, Trial Ownership, and Invite Code

## Summary
This migration fixes four critical issues in the new-couple flow:
1. Email signup loses name/DOB/TOS data when email confirmation is enabled
2. Invited partners (User B) get an exploitable second 7-day trial
3. Invite codes regenerate every time the Pair screen loads
4. request_join does not return inviter name/avatar for the celebration screen

## Changes

### 1. handle_new_user trigger function — read signup metadata
The trigger on auth.users now reads `first_name`, `last_name`, `date_of_birth`,
`tos_accepted_at`, and `age_verified_at` from `raw_user_meta_data` (passed via
`supabase.auth.signUp` options). Previously it only derived a display name from
`full_name`/`name`/email prefix and ignored all other fields.

When metadata is present, the trigger populates the profile row with:
- `first_name` and `last_name` (from metadata, falling back to derived values)
- `display_name` (from metadata `full_name`, or `first_name + last_name`)
- `date_of_birth` (from metadata ISO date string)
- `age_verified_at` (from metadata timestamp)
- `tos_accepted_at` (from metadata timestamp)

This ensures data survives email verification even when no authenticated
session exists yet.

### 2. handle_new_profile_subscription trigger function — one trial per couple
The trigger on profiles INSERT now checks whether the signup originated from a
valid pending invite. When `raw_user_meta_data` contains a `pending_invite_code`
value, the trigger calls `preview_invite` internally to validate the code. If
the code maps to an active solo couple (meaning this user is joining as User B),
no trial subscription is created — User B inherits couple access through the
inviter's subscription.

Solo User A (no `pending_invite_code` in metadata) still receives the normal
7-day trial. Existing paid subscribers are unaffected (ON CONFLICT DO NOTHING).

### 3. generate_invite_code — drop zero-argument overload
The zero-argument `generate_invite_code()` overload is dropped. It always
regenerated a new code, causing the code to change every time the Pair screen
loaded. The authoritative implementation is
`generate_invite_code(force_new boolean DEFAULT false)` which returns the
existing code when `force_new=false` and only generates a new code when
`force_new=true`.

### 4. request_join — return inviter name and avatar
The `request_join` RPC now joins the inviter's profile and returns
`inviter_name` and `inviter_avatar` in the success JSON. This ensures the
paired-celebration screen always has the partner's info even if the preview
call failed.

## Security
- No RLS policy changes.
- No new tables or columns.
- All functions remain SECURITY DEFINER with pinned search_path.
- The trial-suppression check uses the existing `preview_invite` function
  (SECURITY DEFINER) to validate the invite code server-side — it does not
  trust client metadata blindly.
*/

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Update handle_new_user to read signup metadata
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_display_name   text;
  v_first_name     text;
  v_last_name      text;
  v_provider       text;
  v_code           text;
  v_alphabet       text := 'ACDEFGHJKLMNPQRTUVWXY34679';
  v_attempts       int  := 0;
  i                int;
  v_meta_dob       text;
  v_meta_tos       text;
  v_meta_age_ver   text;
  v_meta_fn        text;
  v_meta_ln        text;
  v_meta_full      text;
BEGIN
  -- Pull signup metadata (passed via supabase.auth.signUp options.data)
  v_meta_fn      := NEW.raw_user_meta_data->>'first_name';
  v_meta_ln      := NEW.raw_user_meta_data->>'last_name';
  v_meta_full    := NEW.raw_user_meta_data->>'full_name';
  v_meta_dob     := NEW.raw_user_meta_data->>'date_of_birth';
  v_meta_tos     := NEW.raw_user_meta_data->>'tos_accepted_at';
  v_meta_age_ver := NEW.raw_user_meta_data->>'age_verified_at';

  -- Derive display name: prefer explicit metadata, fall back to OAuth provider
  -- metadata, then email prefix
  v_display_name := COALESCE(
    v_meta_full,
    NULLIF(TRIM(COALESCE(v_meta_fn, '') || ' ' || COALESCE(v_meta_ln, '')), ''),
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    split_part(NEW.email, '@', 1),
    'Warm Me Up user'
  );

  -- Derive first/last name: prefer explicit metadata, fall back to splitting
  v_first_name := COALESCE(
    NULLIF(TRIM(v_meta_fn), ''),
    TRIM(split_part(v_display_name, ' ', 1))
  );
  v_last_name := COALESCE(
    NULLIF(TRIM(v_meta_ln), ''),
    TRIM(CASE
      WHEN strpos(v_display_name, ' ') > 0
      THEN substr(v_display_name, strpos(v_display_name, ' ') + 1)
      ELSE ''
    END)
  );

  -- Detect OAuth provider from identities (first non-email provider wins)
  SELECT provider INTO v_provider
  FROM auth.identities
  WHERE user_id = NEW.id
    AND provider <> 'email'
  ORDER BY created_at
  LIMIT 1;

  -- Insert profile row with all metadata fields
  INSERT INTO public.profiles (
    id, display_name, first_name, last_name, oauth_provider,
    date_of_birth, age_verified_at, tos_accepted_at
  )
  VALUES (
    NEW.id, v_display_name, v_first_name, v_last_name, v_provider,
    NULLIF(v_meta_dob, '')::date,
    NULLIF(v_meta_age_ver, '')::timestamptz,
    NULLIF(v_meta_tos, '')::timestamptz
  )
  ON CONFLICT (id) DO UPDATE
  SET
    oauth_provider   = COALESCE(EXCLUDED.oauth_provider, public.profiles.oauth_provider),
    first_name       = COALESCE(NULLIF(TRIM(EXCLUDED.first_name), ''), public.profiles.first_name),
    last_name        = COALESCE(NULLIF(TRIM(EXCLUDED.last_name), ''), public.profiles.last_name),
    display_name     = COALESCE(NULLIF(TRIM(EXCLUDED.display_name), ''), public.profiles.display_name),
    date_of_birth    = COALESCE(EXCLUDED.date_of_birth, public.profiles.date_of_birth),
    age_verified_at  = COALESCE(EXCLUDED.age_verified_at, public.profiles.age_verified_at),
    tos_accepted_at   = COALESCE(EXCLUDED.tos_accepted_at, public.profiles.tos_accepted_at)
  WHERE public.profiles.oauth_provider IS NULL
     OR public.profiles.tos_accepted_at IS NULL
     OR public.profiles.date_of_birth IS NULL;

  -- Insert user_settings row (no-op if already exists)
  INSERT INTO public.user_settings (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  -- Generate a unique 6-char invite code inline
  LOOP
    v_code := '';
    FOR i IN 1..6 LOOP
      v_code := v_code || substr(v_alphabet, floor(random() * length(v_alphabet))::int + 1, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.couples WHERE invite_code = v_code);
    v_attempts := v_attempts + 1;
    IF v_attempts > 20 THEN
      RAISE EXCEPTION 'Could not generate unique invite code after 20 attempts' USING ERRCODE = 'P0002';
    END IF;
  END LOOP;

  -- Insert solo couple row with active = true
  INSERT INTO public.couples (user_a_id, invite_code, active)
  VALUES (NEW.id, v_code, true)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Update handle_new_profile_subscription — one trial per couple
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_profile_subscription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_pending_code text;
  v_preview      jsonb;
BEGIN
  -- Check if this signup originated from a valid pending invite.
  -- When the client passes pending_invite_code in auth metadata, validate it
  -- server-side via preview_invite. If the code maps to an active solo couple,
  -- this user is joining as User B and should NOT get an independent trial.
  v_pending_code := NULLIF(
    COALESCE(
      current_setting('app.pending_invite_code', true),
      -- Also check the auth user's metadata (available via NEW on profiles INSERT
      -- since the profile is created by handle_new_user which has access to
      -- raw_user_meta_data). We use a session-level GUC as the primary path
      -- because the trigger on profiles does not have direct access to
      -- raw_user_meta_data. The client sets this via a server-side function call
      -- or the handle_new_user trigger sets it before the profile INSERT.
      ''
    ),
    ''
  );

  -- If no pending code was found via GUC, check if the auth user metadata
  -- contains one. We can look it up from auth.users.
  IF v_pending_code IS NULL THEN
    SELECT raw_user_meta_data->>'pending_invite_code'
    INTO v_pending_code
    FROM auth.users
    WHERE id = NEW.id;

    v_pending_code := NULLIF(v_pending_code, '');
  END IF;

  -- If there's a pending invite code, validate it server-side.
  -- If the code is valid and maps to a solo couple, skip trial creation.
  IF v_pending_code IS NOT NULL THEN
    BEGIN
      v_preview := public.preview_invite(v_pending_code);
      IF (v_preview->>'ok')::boolean = true THEN
        -- Valid invite: this user is joining as User B — no independent trial.
        RETURN NEW;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- If preview_invite errors (e.g., rate limit, function error), be safe
      -- and skip the trial. Better to skip a trial than to grant an exploitable
      -- second one. The user will inherit couple access after pairing.
      RETURN NEW;
    END;
  END IF;

  -- Normal solo signup — create the 7-day trial.
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Drop the zero-argument generate_invite_code overload
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.generate_invite_code() CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Update request_join to return inviter name and avatar
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.request_join(invite_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id        uuid;
  v_couple_id      uuid;
  v_user_a_id      uuid;
  v_attempts       int;
  v_window         timestamptz;
  v_sub_owner_id   uuid;
  v_sub_a          uuid;
  v_sub_b          uuid;
  v_inviter_name   text;
  v_inviter_avatar text;
  v_inviter_first  text;
  v_inviter_last   text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'P0001';
  END IF;

  -- Already connected to a partner?
  IF EXISTS (
    SELECT 1 FROM public.couples
    WHERE (user_a_id = v_user_id OR user_b_id = v_user_id)
      AND user_b_id IS NOT NULL
      AND active = true
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_connected');
  END IF;

  -- Rate limit: 10 attempts per 10 minutes (reset on success).
  SELECT attempt_count, window_start
  INTO v_attempts, v_window
  FROM public.invite_join_attempts
  WHERE user_id = v_user_id
  FOR UPDATE;

  IF v_attempts IS NULL THEN
    INSERT INTO public.invite_join_attempts (user_id, attempt_count, window_start)
    VALUES (v_user_id, 1, now());
  ELSIF now() - v_window > interval '10 minutes' THEN
    UPDATE public.invite_join_attempts
    SET attempt_count = 1, window_start = now()
    WHERE user_id = v_user_id;
  ELSE
    UPDATE public.invite_join_attempts
    SET attempt_count = attempt_count + 1
    WHERE user_id = v_user_id;
    IF v_attempts + 1 > 10 THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'rate_limited');
    END IF;
  END IF;

  -- Auto-clear stale pending requests (>30 min old) from other users.
  UPDATE public.couples
  SET pending_partner_id     = NULL,
      pending_partner_status  = NULL,
      pending_requested_at    = NULL
  WHERE user_b_id IS NULL
    AND pending_partner_id IS NOT NULL
    AND pending_partner_id <> v_user_id
    AND pending_requested_at IS NOT NULL
    AND pending_requested_at < now() - interval '30 minutes';

  -- Find the couple with this invite code.
  SELECT id, user_a_id
  INTO v_couple_id, v_user_a_id
  FROM public.couples
  WHERE couples.invite_code = request_join.invite_code
    AND user_b_id IS NULL
  LIMIT 1;

  IF v_couple_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  IF v_user_a_id = v_user_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'self');
  END IF;

  -- Clean up caller's prior pending requests.
  UPDATE public.couples
  SET pending_partner_id     = NULL,
      pending_partner_status  = NULL,
      pending_requested_at    = NULL
  WHERE pending_partner_id = v_user_id
    AND user_b_id IS NULL;

  -- Finalize the connection immediately.
  UPDATE public.couples
  SET user_b_id              = v_user_id,
      active                 = true,
      invite_code_used_at    = now(),
      pending_partner_status = 'accepted',
      pending_partner_id     = NULL,
      pending_requested_at   = NULL
  WHERE id = v_couple_id
    AND user_b_id IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  -- Reset rate limit on success.
  UPDATE public.invite_join_attempts
  SET attempt_count = 0, window_start = now()
  WHERE user_id = v_user_id;

  -- Stamp subscription_owner_id.
  SELECT id INTO v_sub_a FROM public.subscriptions
  WHERE user_id = v_user_a_id AND status = 'active' LIMIT 1;
  SELECT id INTO v_sub_b FROM public.subscriptions
  WHERE user_id = v_user_id AND status = 'active' LIMIT 1;

  v_sub_owner_id := COALESCE(
    CASE WHEN v_sub_a IS NOT NULL THEN v_user_a_id END,
    CASE WHEN v_sub_b IS NOT NULL THEN v_user_id END
  );

  IF v_sub_owner_id IS NOT NULL THEN
    UPDATE public.couples SET subscription_owner_id = v_sub_owner_id WHERE id = v_couple_id;
  END IF;

  -- Seed scores rows (0 points) for both partners.
  INSERT INTO public.scores (couple_id, user_id, points)
  VALUES (v_couple_id, v_user_a_id, 0), (v_couple_id, v_user_id, 0)
  ON CONFLICT (couple_id, user_id) DO NOTHING;

  -- Delete User B's solo placeholder couple.
  DELETE FROM public.couples
  WHERE user_a_id = v_user_id AND user_b_id IS NULL AND id <> v_couple_id;

  -- Fetch inviter's name and avatar for the celebration screen.
  SELECT first_name, last_name, avatar_url
  INTO v_inviter_first, v_inviter_last, v_inviter_avatar
  FROM public.profiles
  WHERE id = v_user_a_id;

  v_inviter_name := CASE
    WHEN v_inviter_last IS NOT NULL AND length(v_inviter_last) > 0
    THEN v_inviter_first || ' ' || substr(v_inviter_last, 1, 1) || '.'
    ELSE COALESCE(v_inviter_first, 'Your partner')
  END;

  RETURN jsonb_build_object(
    'ok',             true,
    'couple_id',      v_couple_id,
    'user_a_id',      v_user_a_id,
    'status',         'accepted',
    'inviter_name',   v_inviter_name,
    'inviter_avatar', v_inviter_avatar
  );
END;
$function$;
