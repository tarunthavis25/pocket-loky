create table public.pocket_loky_vaults (
  owner_id uuid primary key references auth.users (id) on delete cascade default auth.uid(),
  wrapped_key jsonb not null check (
    jsonb_typeof(wrapped_key) = 'object' and octet_length(wrapped_key::text) <= 512
  ),
  created_at timestamptz not null default now()
);

create table public.pocket_loky_logins (
  owner_id uuid not null references public.pocket_loky_vaults (owner_id) on delete cascade default auth.uid(),
  id uuid not null,
  payload jsonb not null check (
    jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 32768
  ),
  created_at timestamptz not null default now(),
  primary key (owner_id, id)
);

alter table public.pocket_loky_vaults enable row level security;
alter table public.pocket_loky_logins enable row level security;

revoke all on public.pocket_loky_vaults, public.pocket_loky_logins from public, anon, authenticated;
grant select, insert on public.pocket_loky_vaults to authenticated;
grant select, insert, delete on public.pocket_loky_logins to authenticated;
grant update (payload) on public.pocket_loky_logins to authenticated;

create policy "Read own vault" on public.pocket_loky_vaults for select to authenticated
  using ((select auth.uid()) = owner_id);
create policy "Create own vault" on public.pocket_loky_vaults for insert to authenticated
  with check ((select auth.uid()) = owner_id);

create policy "Read own logins" on public.pocket_loky_logins for select to authenticated
  using ((select auth.uid()) = owner_id);
create policy "Add own logins" on public.pocket_loky_logins for insert to authenticated
  with check ((select auth.uid()) = owner_id);
create policy "Edit own logins" on public.pocket_loky_logins for update to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "Delete own logins" on public.pocket_loky_logins for delete to authenticated
  using ((select auth.uid()) = owner_id);
