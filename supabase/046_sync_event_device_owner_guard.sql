-- NUBYX Continuity: enforce device ownership inside the database
-- Apply after 002_device_sync.sql.
--
-- RLS already protects normal authenticated inserts, but privileged backend
-- workers can bypass RLS. Keep audit integrity by rejecting any sync event
-- whose device_id belongs to a different user_id.

create or replace function public.nubyx_guard_sync_event_device_owner()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.device_id is not null and not exists (
    select 1
    from public.user_devices d
    where d.id = new.device_id
      and d.user_id = new.user_id
  ) then
    raise exception 'device_id must belong to sync event user_id'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.nubyx_guard_sync_event_device_owner() from public;

drop trigger if exists nubyx_sync_event_device_owner_guard on public.sync_events;

create trigger nubyx_sync_event_device_owner_guard
before insert on public.sync_events
for each row
execute function public.nubyx_guard_sync_event_device_owner();

comment on function public.nubyx_guard_sync_event_device_owner() is
  'Rejects NUBYX sync events whose device does not belong to the event owner.';

comment on trigger nubyx_sync_event_device_owner_guard on public.sync_events is
  'Preserves device-to-user integrity for the append-only NUBYX Continuity event log.';
