-- NUBYX Continuity: make sync-event timestamps server authoritative
-- Apply after 002_device_sync.sql and before relying on retention windows.
--
-- sync_events.created_at has a DEFAULT, but PostgreSQL still accepts an
-- explicit client-supplied value. A browser could otherwise submit a far-future
-- timestamp and keep an event outside the normal retention window indefinitely.
-- This trigger normalizes every new event to the database clock.

create or replace function public.nubyx_sync_event_server_timestamp()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.created_at := pg_catalog.clock_timestamp();
  return new;
end;
$$;

drop trigger if exists nubyx_sync_event_server_timestamp_guard on public.sync_events;

create trigger nubyx_sync_event_server_timestamp_guard
before insert on public.sync_events
for each row
execute function public.nubyx_sync_event_server_timestamp();

-- The trigger function is not an application API surface.
revoke all on function public.nubyx_sync_event_server_timestamp() from public;
revoke all on function public.nubyx_sync_event_server_timestamp() from anon;
revoke all on function public.nubyx_sync_event_server_timestamp() from authenticated;

comment on function public.nubyx_sync_event_server_timestamp() is
  'Forces sync_events.created_at to the database clock so clients cannot evade retention with forged timestamps.';
