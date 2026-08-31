/*
# Wire screenshot_notify_partner to allow_screenshot retroactively

## What this does
1. Extends the existing `sync_owned_media_permissions_from_settings()` trigger
   so that when a user toggles `screenshot_notify_partner`, ALL their existing
   chat messages, vault items, and interactions are updated to reflect the
   new `allow_screenshot` value.
2. Backfills existing items: if a user currently has `screenshot_notify_partner = false`,
   all their media gets `allow_screenshot = true` (screenshots allowed).

## Why
The "Notify Me if My Content is Screenshotted" setting is now the master switch
for screenshot detection. When off, screenshots are fully allowed (no warning,
no activity record, no notification). When on, detection works as before.
This is retroactive — changing the setting updates all past and future uploads.
*/

CREATE OR REPLACE FUNCTION public.sync_owned_media_permissions_from_settings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF new.vault_allow_save_default IS DISTINCT FROM old.vault_allow_save_default THEN
    UPDATE public.chat_messages
       SET allow_save = COALESCE(new.vault_allow_save_default, false)
     WHERE sender_id = new.user_id
       AND media_storage_path IS NOT NULL;

    UPDATE public.vault_items
       SET allow_save = COALESCE(new.vault_allow_save_default, false)
     WHERE uploaded_by_user_id = new.user_id;
  END IF;

  IF new.vault_allow_share_default IS DISTINCT FROM old.vault_allow_share_default THEN
    UPDATE public.chat_messages
       SET allow_share = COALESCE(new.vault_allow_share_default, false)
     WHERE sender_id = new.user_id
       AND media_storage_path IS NOT NULL;

    UPDATE public.vault_items
       SET allow_share = COALESCE(new.vault_allow_share_default, false)
     WHERE uploaded_by_user_id = new.user_id;
  END IF;

  IF new.screenshot_notify_partner IS DISTINCT FROM old.screenshot_notify_partner THEN
    UPDATE public.chat_messages
       SET allow_screenshot = NOT COALESCE(new.screenshot_notify_partner, true)
     WHERE sender_id = new.user_id
       AND media_storage_path IS NOT NULL;

    UPDATE public.vault_items
       SET allow_screenshot = NOT COALESCE(new.screenshot_notify_partner, true)
     WHERE uploaded_by_user_id = new.user_id;

    UPDATE public.interactions
       SET allow_screenshot = NOT COALESCE(new.screenshot_notify_partner, true)
     WHERE sender_id = new.user_id
       AND media_storage_path IS NOT NULL;
  END IF;

  RETURN new;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_owned_media_permissions_from_settings() FROM public;

DROP TRIGGER IF EXISTS sync_owned_media_permissions_from_settings_trigger ON public.user_settings;
CREATE TRIGGER sync_owned_media_permissions_from_settings_trigger
AFTER UPDATE OF vault_allow_save_default, vault_allow_share_default, screenshot_notify_partner
ON public.user_settings
FOR EACH ROW
EXECUTE FUNCTION public.sync_owned_media_permissions_from_settings();

-- Backfill: users with screenshot_notify_partner = false get allow_screenshot = true
UPDATE public.chat_messages
   SET allow_screenshot = true
 WHERE sender_id IN (
   SELECT user_id FROM public.user_settings
   WHERE COALESCE(screenshot_notify_partner, true) = false
 )
 AND media_storage_path IS NOT NULL
 AND allow_screenshot = false;

UPDATE public.vault_items
   SET allow_screenshot = true
 WHERE uploaded_by_user_id IN (
   SELECT user_id FROM public.user_settings
   WHERE COALESCE(screenshot_notify_partner, true) = false
 )
 AND allow_screenshot = false;

UPDATE public.interactions
   SET allow_screenshot = true
 WHERE sender_id IN (
   SELECT user_id FROM public.user_settings
   WHERE COALESCE(screenshot_notify_partner, true) = false
 )
 AND media_storage_path IS NOT NULL
 AND allow_screenshot = false;
