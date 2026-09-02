-- NUBYX Continuity: authoritative server timestamps for device registry
-- Apply after 002_device_sync.sql.
--
-- Device presence is used by Continuity to reason about active sessions and devices.
-- Browser-supplied created_at/last_seen_at values must not be trusted because a
-- client can forge dates in the past or future. This trigger makes the database
-- authoritative while preserving the original created_at on updates.

create or replace function public.nubyx_set_device_timestamps()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  server_now timestamptz := statement_timestamp();
begin
  if tg_op = 'INSERT' then
    new.created_at := server_now;
  else
    new.created_at := old.created_at;
  end if;

  new.last_seen_at := server_now;
  return new;
end;
$$;

revoke all on function public.nubyx_set_device_timestamps() from public;

drop trigger if exists nubyx_user_devices_server_timestamps on public.user_devices;
create trigger nubyx_user_devices_server_timestamps
before insert or update on public.user_devices
for each row
execute function public.nubyx_set_device_timestamps();

comment on function public.nubyx_set_device_timestamps() is
  'Forces user_devices.created_at and last_seen_at to database time so clients cannot forge device-presence timestamps.';
