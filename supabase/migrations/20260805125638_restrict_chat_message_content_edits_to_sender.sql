/*
  # Only the sender may change a chat message's wording

  1. Problem
     - Policy "Couple members can update chat messages" is couple-scoped only, so either
       partner could PATCH the other partner's message and rewrite `content_text`.
     - The app already scopes edits with .eq('sender_id', user.id), but that is a client
       filter an attacker simply omits.
     - The same policy is required for legitimate cross-writes (burning a message via
       `deleted_at`, setting `burn_after_seconds`, linking `vault_item_id`), so the policy
       itself must stay permissive; the restriction has to be per column.

  2. Change
     - BEFORE UPDATE trigger that rejects a change to `content_text` or `edited_at` when
       the caller is not the original sender. Only direct REST calls made as the
       `authenticated` role are checked, so SECURITY DEFINER functions, triggers and the
       service role are unaffected.

  3. Hardening applied at the same time
     - `protect_profile_admin_flags` only guards UPDATE, so a BEFORE INSERT guard is added
       that forces `is_admin` / `is_super_admin` to false on any profile row inserted by
       the `authenticated` role.
*/

CREATE OR REPLACE FUNCTION public.protect_chat_message_content()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  -- Only guard direct REST API calls; definer functions and the service role run as
  -- another role and are the intended paths for maintenance writes.
  IF current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;

  IF (NEW.content_text IS DISTINCT FROM OLD.content_text
      OR NEW.edited_at IS DISTINCT FROM OLD.edited_at)
     AND OLD.sender_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Only the sender can edit a message'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_chat_message_content_trigger ON public.chat_messages;

CREATE TRIGGER protect_chat_message_content_trigger
  BEFORE UPDATE ON public.chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_chat_message_content();

CREATE OR REPLACE FUNCTION public.protect_profile_admin_flags_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;

  NEW.is_admin := false;
  NEW.is_super_admin := false;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_profile_admin_flags_insert_trigger ON public.profiles;

CREATE TRIGGER protect_profile_admin_flags_insert_trigger
  BEFORE INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_admin_flags_on_insert();
