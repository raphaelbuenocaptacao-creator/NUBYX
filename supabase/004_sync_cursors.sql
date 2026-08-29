-- NUBYX Continuity: resumable per-device synchronization cursors
-- Apply after 002_device_sync.sql.
-- Purpose: let each authenticated device resume from its last processed event
-- without scanning the full append-only sync_events history on every reconnect.

create table if not exists public.sync_cursors (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id uuid not null references public.user_devices(id) on delete cascade,
  channel text not null check (channel in ('workspace','apps','files','profile','settings')),
  last_event_id bigint not null default 0 check (last_event_id >= 0),
  updated_at timestamptz not null default now(),
  unique (device_id, channel)
);

alter table public.sync_cursors enable row level security;

drop policy if exists "sync cursors own rows select" on public.sync_cursors;
drop policy if exists "sync cursors own rows insert" on public.sync_cursors;
drop policy if exists "sync cursors own rows update" on public.sync_cursors;
drop policy if exists "sync cursors own rows delete" on public.sync_cursors;

create policy "sync cursors own rows select" on public.sync_cursors
for select to authenticated
using (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.user_devices d
    where d.id = device_id
      and d.user_id = (select auth.uid())
  )
);

create policy "sync cursors own rows insert" on public.sync_cursors
for insert to authenticated
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.user_devices d
    where d.id = device_id
      and d.user_id = (select auth.uid())
  )
);

create policy "sync cursors own rows update" on public.sync_cursors
for update to authenticated
using (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.user_devices d
    where d.id = device_id
      and d.user_id = (select auth.uid())
  )
)
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.user_devices d
    where d.id = device_id
      and d.user_id = (select auth.uid())
  )
);

create policy "sync cursors own rows delete" on public.sync_cursors
for delete to authenticated
using (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.user_devices d
    where d.id = device_id
      and d.user_id = (select auth.uid())
  )
);

create index if not exists sync_cursors_user_device_idx
  on public.sync_cursors (user_id, device_id);

create index if not exists sync_cursors_user_channel_idx
  on public.sync_cursors (user_id, channel, last_event_id desc);

-- Prevent clients from moving a cursor backwards. This avoids accidental
-- replay storms and keeps reconnect behavior monotonic per device/channel.
create or replace function public.nubyx_enforce_monotonic_sync_cursor()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.last_event_id < old.last_event_id then
    raise exception 'sync cursor cannot move backwards';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists nubyx_sync_cursor_monotonic on public.sync_cursors;
create trigger nubyx_sync_cursor_monotonic
before update on public.sync_cursors
for each row execute function public.nubyx_enforce_monotonic_sync_cursor();

comment on table public.sync_cursors is
  'Per-user, per-device Continuity checkpoints used to resume synchronization efficiently and safely.';
