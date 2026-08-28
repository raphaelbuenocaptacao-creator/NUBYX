-- NUBYX MVP data model
-- Run in Supabase SQL editor after reviewing for your project.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  wallpaper text default 'nebula',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_apps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  app_key text not null,
  app_name text not null,
  app_url text,
  icon text,
  position integer not null default 0,
  installed_at timestamptz not null default now(),
  unique(user_id, app_key)
);

create table if not exists public.workspace_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.files_meta (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,
  name text not null,
  mime_type text,
  size_bytes bigint not null default 0,
  folder text not null default '/',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, storage_path)
);

alter table public.profiles enable row level security;
alter table public.user_apps enable row level security;
alter table public.workspace_state enable row level security;
alter table public.files_meta enable row level security;

create policy "profiles own row select" on public.profiles for select using (auth.uid() = id);
create policy "profiles own row insert" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles own row update" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

create policy "apps own rows select" on public.user_apps for select using (auth.uid() = user_id);
create policy "apps own rows insert" on public.user_apps for insert with check (auth.uid() = user_id);
create policy "apps own rows update" on public.user_apps for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "apps own rows delete" on public.user_apps for delete using (auth.uid() = user_id);

create policy "state own row select" on public.workspace_state for select using (auth.uid() = user_id);
create policy "state own row insert" on public.workspace_state for insert with check (auth.uid() = user_id);
create policy "state own row update" on public.workspace_state for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "files own rows select" on public.files_meta for select using (auth.uid() = user_id);
create policy "files own rows insert" on public.files_meta for insert with check (auth.uid() = user_id);
create policy "files own rows update" on public.files_meta for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "files own rows delete" on public.files_meta for delete using (auth.uid() = user_id);

insert into storage.buckets (id, name, public)
values ('nubyx-user-files','nubyx-user-files',false)
on conflict (id) do nothing;

create policy "storage own folder select" on storage.objects for select using (
  bucket_id='nubyx-user-files' and auth.uid()::text = (storage.foldername(name))[1]
);
create policy "storage own folder insert" on storage.objects for insert with check (
  bucket_id='nubyx-user-files' and auth.uid()::text = (storage.foldername(name))[1]
);
create policy "storage own folder update" on storage.objects for update using (
  bucket_id='nubyx-user-files' and auth.uid()::text = (storage.foldername(name))[1]
);
create policy "storage own folder delete" on storage.objects for delete using (
  bucket_id='nubyx-user-files' and auth.uid()::text = (storage.foldername(name))[1]
);
