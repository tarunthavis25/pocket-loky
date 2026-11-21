create table public.pocket_loky_server_logins (
  owner_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  id uuid not null,
  payload jsonb not null check (
    jsonb_typeof(payload) = 'object'
    and payload ?& array['version', 'iv', 'ciphertext']
    and payload - array['version', 'iv', 'ciphertext'] = '{}'::jsonb
    and payload->'version' = '1'::jsonb
    and jsonb_typeof(payload->'iv') = 'string'
    and jsonb_typeof(payload->'ciphertext') = 'string'
    and octet_length(payload::text) <= 32768
  ),
  created_at timestamptz not null default now(),
  primary key (owner_id, id)
);

create table public.pocket_loky_server_imports (
  owner_id uuid primary key references auth.users (id) on delete cascade default auth.uid(),
  completed boolean not null default false
);

alter table public.pocket_loky_server_logins enable row level security;
alter table public.pocket_loky_server_imports enable row level security;

revoke all on public.pocket_loky_server_logins, public.pocket_loky_server_imports
  from public, anon, authenticated;

grant select, insert, update, delete on public.pocket_loky_server_logins to authenticated;
grant select, insert, update on public.pocket_loky_server_imports to authenticated;

create policy "Manage own server logins"
  on public.pocket_loky_server_logins for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy "Read own import"
  on public.pocket_loky_server_imports for select to authenticated
  using ((select auth.uid()) = owner_id);

create policy "Create own import"
  on public.pocket_loky_server_imports for insert to authenticated
  with check ((select auth.uid()) = owner_id);

create policy "Update own import"
  on public.pocket_loky_server_imports for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create function public.pocket_loky_import_logins(p_entries jsonb, p_done boolean)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  already_done boolean;
begin
  if caller is null then
    raise exception 'Authentication required';
  end if;

  if p_entries is null or jsonb_typeof(p_entries) <> 'array' then
    raise exception 'Invalid import batch';
  end if;

  if jsonb_array_length(p_entries) > 25 then
    raise exception 'Invalid import batch size';
  end if;

  insert into public.pocket_loky_server_imports (owner_id)
  values (caller)
  on conflict (owner_id) do nothing;

  select completed into already_done
  from public.pocket_loky_server_imports
  where owner_id = caller
  for update;

  if already_done then
    return;
  end if;

  insert into public.pocket_loky_server_logins (owner_id, id, payload, created_at)
  select caller, item.id, item.payload, item.created_at
  from jsonb_to_recordset(p_entries) as item(id uuid, payload jsonb, created_at timestamptz)
  on conflict (owner_id, id) do nothing;

  if p_done then
    update public.pocket_loky_server_imports
    set completed = true
    where owner_id = caller;
  end if;
end;
$$;

revoke all on function public.pocket_loky_import_logins(jsonb, boolean)
  from public, anon, authenticated;

grant execute on function public.pocket_loky_import_logins(jsonb, boolean)
  to authenticated;