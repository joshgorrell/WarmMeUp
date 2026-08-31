-- Privacy hardening: external sharing can expose a Save to Photos/Files action in the OS share sheet.
-- To avoid Share becoming a bypass around a user's device-save restriction, sharing may only
-- be enabled when device saving/export is also enabled.

create or replace function public.normalize_media_export_permissions()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if coalesce(new.allow_save, false) = false then
    new.allow_share := false;
  end if;
  return new;
end;
$$;

revoke all on function public.normalize_media_export_permissions() from public;

DROP TRIGGER IF EXISTS normalize_chat_media_export_permissions ON public.chat_messages;
CREATE TRIGGER normalize_chat_media_export_permissions
BEFORE INSERT OR UPDATE OF allow_save, allow_share ON public.chat_messages
FOR EACH ROW
WHEN (new.media_storage_path is not null)
EXECUTE FUNCTION public.normalize_media_export_permissions();

DROP TRIGGER IF EXISTS normalize_vault_media_export_permissions ON public.vault_items;
CREATE TRIGGER normalize_vault_media_export_permissions
BEFORE INSERT OR UPDATE OF allow_save, allow_share ON public.vault_items
FOR EACH ROW
EXECUTE FUNCTION public.normalize_media_export_permissions();

-- Keep user defaults internally consistent as well. If saving/export is disabled,
-- external sharing must be disabled because the native share sheet can itself save media.
create or replace function public.normalize_user_media_export_defaults()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if coalesce(new.vault_allow_save_default, false) = false then
    new.vault_allow_share_default := false;
  end if;
  return new;
end;
$$;

revoke all on function public.normalize_user_media_export_defaults() from public;

DROP TRIGGER IF EXISTS normalize_user_media_export_defaults_trigger ON public.user_settings;
CREATE TRIGGER normalize_user_media_export_defaults_trigger
BEFORE INSERT OR UPDATE OF vault_allow_save_default, vault_allow_share_default
ON public.user_settings
FOR EACH ROW
EXECUTE FUNCTION public.normalize_user_media_export_defaults();

-- Normalize existing data so there are no legacy rows where sharing is allowed while
-- device saving/export is prohibited.
UPDATE public.chat_messages
SET allow_share = false
WHERE media_storage_path IS NOT NULL
  AND coalesce(allow_save, false) = false
  AND coalesce(allow_share, false) = true;

UPDATE public.vault_items
SET allow_share = false
WHERE coalesce(allow_save, false) = false
  AND coalesce(allow_share, false) = true;

UPDATE public.user_settings
SET vault_allow_share_default = false
WHERE coalesce(vault_allow_save_default, false) = false
  AND coalesce(vault_allow_share_default, false) = true;
