/*
  # Force PostgREST schema cache reload for generate_invite_code

  The zero-argument generate_invite_code() function exists with correct signature,
  body, and grants, but PostgREST is returning PGRST202 (function not found in
  schema cache). This migration drops and recreates the function identically to
  force a cache invalidation, then issues notify pgrst, 'reload schema'.

  Changes:
  - Drop and recreate public.generate_invite_code() to bust PostgREST cache
  - Re-grant EXECUTE to authenticated
  - Send reload notification
*/

-- Drop all overloads of generate_invite_code to ensure a clean slate
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'generate_invite_code'
  loop
    execute 'drop function if exists ' || r.signature;
  end loop;
end $$;

create or replace function public.generate_invite_code()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id  uuid;
  new_code         text;
  target_couple_id uuid;
  v_alphabet       text := 'ACDEFGHJKLMNPQRTUVWXY34679';
  v_attempts       int  := 0;
  i                int;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'Not authenticated' using errcode = 'P0001';
  end if;

  -- Generate a unique 6-char code from a safe alphabet (no ambiguous chars)
  loop
    new_code := '';
    for i in 1..6 loop
      new_code := new_code || substr(v_alphabet, floor(random() * length(v_alphabet))::int + 1, 1);
    end loop;
    exit when not exists (
      select 1 from public.couples where invite_code = new_code
    );
    v_attempts := v_attempts + 1;
    if v_attempts > 20 then
      raise exception 'Could not generate unique invite code after 20 attempts' using errcode = 'P0002';
    end if;
  end loop;

  -- Find any solo couple for this user (active or inactive) — prefer active, then newest
  select id into target_couple_id
  from public.couples
  where user_a_id = current_user_id
    and user_b_id is null
  order by active desc, created_at desc
  limit 1;

  if target_couple_id is not null then
    -- Reactivate and stamp with the new invite code
    update public.couples
    set
      invite_code = new_code,
      active      = true,
      updated_at  = now()
    where id = target_couple_id;
  else
    -- No couple row at all — create a fresh one
    insert into public.couples (
      user_a_id,
      user_b_id,
      active,
      invite_code,
      subscription_owner_id,
      points_enabled,
      streaks_enabled
    ) values (
      current_user_id,
      null,
      true,
      new_code,
      current_user_id,
      true,
      true
    )
    returning id into target_couple_id;
  end if;

  return jsonb_build_object(
    'success',     true,
    'invite_code', new_code,
    'couple_id',   target_couple_id
  );
end;
$$;

grant execute on function public.generate_invite_code() to authenticated;

notify pgrst, 'reload schema';
