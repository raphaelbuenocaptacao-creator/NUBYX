-- NUBYX Continuity: authoritative server timestamps for append-only sync events
-- Apply after 002_device_sync.sql.
--
-- Retention, auditing and operational diagnostics must not trust a browser-supplied
-- created_at value. The client currently relies on the column default, but an
-- authenticated caller could still craft a direct insert with an arbitrary date.
-- This trigger makes the database the final authority for event creation time.

create or replace function public.nubyx_set_sync_event_created_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.created_at := statement_timestamp();
  return new;
end;
$$;

revoke all on function public.nubyx_set_sync_event_created_at() from public;

drop trigger if exists nubyx_sync_events_server_created_at on public.sync_events;
create trigger nubyx_sync_events_server_created_at
before insert on public.sync_events
for each row
execute function public.nubyx_set_sync_event_created_at();

comment on function public.nubyx_set_sync_event_created_at() is
  'Forces sync_events.created_at to database time so clients cannot forge timestamps used by retention and audit flows.';
