-- Media privacy hardening
-- 1) A user's Save/Share privacy toggles apply retroactively to all of their media.
-- 2) A partner cannot change the media owner's allow_save/allow_share/allow_screenshot flags.

create or replace function public.sync_owned_media_permissions_from_settings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.vault_allow_save_default is distinct from old.vault_allow_save_default then
    update public.chat_messages
       set allow_save = coalesce(new.vault_allow_save_default, false)
     where sender_id = new.user_id
       and media_storage_path is not null;

    update public.vault_items
       set allow_save = coalesce(new.vault_allow_save_default, false)
     where uploaded_by_user_id = new.user_id;
  end if;

  if new.vault_allow_share_default is distinct from old.vault_allow_share_default then
    update public.chat_messages
       set allow_share = coalesce(new.vault_allow_share_default, false)
     where sender_id = new.user_id
       and media_storage_path is not null;

    update public.vault_items
       set allow_share = coalesce(new.vault_allow_share_default, false)
     where uploaded_by_user_id = new.user_id;
  end if;

  return new;
end;
$$;

revoke all on function public.sync_owned_media_permissions_from_settings() from public;

DROP TRIGGER IF EXISTS sync_owned_media_permissions_from_settings_trigger ON public.user_settings;
CREATE TRIGGER sync_owned_media_permissions_from_settings_trigger
AFTER UPDATE OF vault_allow_save_default, vault_allow_share_default
ON public.user_settings
FOR EACH ROW
EXECUTE FUNCTION public.sync_owned_media_permissions_from_settings();

create or replace function public.protect_media_owner_permission_flags()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  owner_id uuid;
begin
  -- Service-role/internal operations have no auth.uid() and may proceed.
  if auth.uid() is null then
    return new;
  end if;

  if tg_table_name = 'chat_messages' then
    owner_id := old.sender_id;
  elsif tg_table_name = 'vault_items' then
    owner_id := old.uploaded_by_user_id;
  else
    return new;
  end if;

  if auth.uid() <> owner_id and (
       new.allow_save is distinct from old.allow_save
    or new.allow_share is distinct from old.allow_share
    or new.allow_screenshot is distinct from old.allow_screenshot
  ) then
    raise exception 'Only the media owner may change media privacy permissions.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.protect_media_owner_permission_flags() from public;

DROP TRIGGER IF EXISTS protect_chat_media_owner_permission_flags ON public.chat_messages;
CREATE TRIGGER protect_chat_media_owner_permission_flags
BEFORE UPDATE ON public.chat_messages
FOR EACH ROW
WHEN (old.media_storage_path is not null)
EXECUTE FUNCTION public.protect_media_owner_permission_flags();

DROP TRIGGER IF EXISTS protect_vault_media_owner_permission_flags ON public.vault_items;
CREATE TRIGGER protect_vault_media_owner_permission_flags
BEFORE UPDATE ON public.vault_items
FOR EACH ROW
EXECUTE FUNCTION public.protect_media_owner_permission_flags();
