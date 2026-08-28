-- NUBYX Continuity: multi-device synchronization baseline
-- Safe to review/apply after supabase/schema.sql.

create table if not exists public.user_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_key text not null check (length(device_key) between 8 and 120),
  device_name text not null check (length(device_name) between 1 and 120),
  platform text,
  user_agent text,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(user_id, device_key)
);

create table if not exists public.sync_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id uuid references public.user_devices(id) on delete set null,
  channel text not null check (channel in ('workspace','apps','files','profile','settings')),
  entity_key text not null check (length(entity_key) between 1 and 255),
  event_type text not null check (event_type in ('upsert','delete')),
  version bigint not null default 1 check (version > 0),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (jsonb_typeof(payload) = 'object')
);

alter table public.user_devices enable row level security;
alter table public.sync_events enable row level security;

drop policy if exists "devices own rows select" on public.user_devices;
drop policy if exists "devices own rows insert" on public.user_devices;
drop policy if exists "devices own rows update" on public.user_devices;
drop policy if exists "devices own rows delete" on public.user_devices;

drop policy if exists "sync own rows select" on public.sync_events;
drop policy if exists "sync own rows insert" on public.sync_events;

create policy "devices own rows select" on public.user_devices
for select to authenticated
using ((select auth.uid()) = user_id);

create policy "devices own rows insert" on public.user_devices
for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "devices own rows update" on public.user_devices
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "devices own rows delete" on public.user_devices
for delete to authenticated
using ((select auth.uid()) = user_id);

create policy "sync own rows select" on public.sync_events
for select to authenticated
using ((select auth.uid()) = user_id);

create policy "sync own rows insert" on public.sync_events
for insert to authenticated
with check (
  (select auth.uid()) = user_id
  and (
    device_id is null
    or exists (
      select 1
      from public.user_devices d
      where d.id = device_id
        and d.user_id = (select auth.uid())
    )
  )
);

-- Clients never rewrite historical sync events. Corrections are new events.
-- This keeps the sync log append-only and auditable.

create index if not exists user_devices_user_last_seen_idx
  on public.user_devices (user_id, last_seen_at desc);

create index if not exists sync_events_user_id_idx
  on public.sync_events (user_id, id desc);

create index if not exists sync_events_user_channel_id_idx
  on public.sync_events (user_id, channel, id desc);

-- Enable Supabase Realtime only if the table is not already part of the publication.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'sync_events'
  ) then
    alter publication supabase_realtime add table public.sync_events;
  end if;
end;
$$;

comment on table public.user_devices is 'Trusted device registry for NUBYX Continuity.';
comment on table public.sync_events is 'Append-only per-user event stream for cross-device synchronization.';
