-- NUBYX MVP data model
-- Safe multi-user baseline for Supabase.
-- Review in a staging project before applying to production.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  wallpaper text not null default 'nebula',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_apps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  app_key text not null check (length(app_key) between 1 and 80),
  app_name text not null check (length(app_name) between 1 and 120),
  app_url text,
  icon text,
  position integer not null default 0 check (position >= 0),
  installed_at timestamptz not null default now(),
  unique(user_id, app_key)
);

create table if not exists public.workspace_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(state) = 'object')
);

create table if not exists public.files_meta (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null check (length(storage_path) between 1 and 1024),
  name text not null check (length(name) between 1 and 255),
  mime_type text,
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  folder text not null default '/',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, storage_path)
);

-- Keep updated_at trustworthy on mutable user-owned records.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists workspace_state_set_updated_at on public.workspace_state;
create trigger workspace_state_set_updated_at
before update on public.workspace_state
for each row execute function public.set_updated_at();

drop trigger if exists files_meta_set_updated_at on public.files_meta;
create trigger files_meta_set_updated_at
before update on public.files_meta
for each row execute function public.set_updated_at();

-- Create a private NUBYX profile automatically for each Auth user.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    nullif(coalesce(new.raw_user_meta_data ->> 'display_name', ''), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.user_apps enable row level security;
alter table public.workspace_state enable row level security;
alter table public.files_meta enable row level security;

-- Re-create policies so this migration remains safe to re-run.
drop policy if exists "profiles own row select" on public.profiles;
drop policy if exists "profiles own row insert" on public.profiles;
drop policy if exists "profiles own row update" on public.profiles;
drop policy if exists "apps own rows select" on public.user_apps;
drop policy if exists "apps own rows insert" on public.user_apps;
drop policy if exists "apps own rows update" on public.user_apps;
drop policy if exists "apps own rows delete" on public.user_apps;
drop policy if exists "state own row select" on public.workspace_state;
drop policy if exists "state own row insert" on public.workspace_state;
drop policy if exists "state own row update" on public.workspace_state;
drop policy if exists "files own rows select" on public.files_meta;
drop policy if exists "files own rows insert" on public.files_meta;
drop policy if exists "files own rows update" on public.files_meta;
drop policy if exists "files own rows delete" on public.files_meta;

create policy "profiles own row select" on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy "profiles own row insert" on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy "profiles own row update" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy "apps own rows select" on public.user_apps for select to authenticated using ((select auth.uid()) = user_id);
create policy "apps own rows insert" on public.user_apps for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "apps own rows update" on public.user_apps for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "apps own rows delete" on public.user_apps for delete to authenticated using ((select auth.uid()) = user_id);

create policy "state own row select" on public.workspace_state for select to authenticated using ((select auth.uid()) = user_id);
create policy "state own row insert" on public.workspace_state for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "state own row update" on public.workspace_state for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "files own rows select" on public.files_meta for select to authenticated using ((select auth.uid()) = user_id);
create policy "files own rows insert" on public.files_meta for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "files own rows update" on public.files_meta for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "files own rows delete" on public.files_meta for delete to authenticated using ((select auth.uid()) = user_id);

-- Private per-user file bucket. Object keys must start with auth.uid().
insert into storage.buckets (id, name, public)
values ('nubyx-user-files','nubyx-user-files',false)
on conflict (id) do update set public = false;

drop policy if exists "storage own folder select" on storage.objects;
drop policy if exists "storage own folder insert" on storage.objects;
drop policy if exists "storage own folder update" on storage.objects;
drop policy if exists "storage own folder delete" on storage.objects;

create policy "storage own folder select" on storage.objects
for select to authenticated
using (
  bucket_id = 'nubyx-user-files'
  and (select auth.uid())::text = (storage.foldername(name))[1]
);

create policy "storage own folder insert" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'nubyx-user-files'
  and (select auth.uid())::text = (storage.foldername(name))[1]
);

-- Both USING and WITH CHECK are required: a user cannot rename/move an object
-- into another user's prefix during an UPDATE.
create policy "storage own folder update" on storage.objects
for update to authenticated
using (
  bucket_id = 'nubyx-user-files'
  and (select auth.uid())::text = (storage.foldername(name))[1]
)
with check (
  bucket_id = 'nubyx-user-files'
  and (select auth.uid())::text = (storage.foldername(name))[1]
);

create policy "storage own folder delete" on storage.objects
for delete to authenticated
using (
  bucket_id = 'nubyx-user-files'
  and (select auth.uid())::text = (storage.foldername(name))[1]
);

-- Helpful indexes for user-scoped queries as data volume grows.
create index if not exists user_apps_user_position_idx on public.user_apps (user_id, position);
create index if not exists files_meta_user_folder_created_idx on public.files_meta (user_id, folder, created_at desc);
