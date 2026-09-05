-- NUBYX ID / Continuity: make trusted-device timestamps server authoritative
-- Apply after 002_device_sync.sql and 055_device_revocation_guard.sql.
--
-- user_devices.created_at and last_seen_at have DEFAULT values, but PostgreSQL
-- still accepts explicit client-supplied timestamps. Device trust/audit metadata
-- should not depend on a browser clock, which may be wrong or intentionally
-- forged. This trigger keeps creation immutable and normalizes activity updates
-- to the database clock without changing existing rows during migration.

create or replace function public.nubyx_device_server_timestamps()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  server_now timestamptz := pg_catalog.clock_timestamp();
begin
  if tg_op = 'INSERT' then
    new.created_at := server_now;
    new.last_seen_at := server_now;
    return new;
  end if;

  -- Creation time is immutable even for write paths that bypass RLS.
  new.created_at := old.created_at;

  -- Only normalize activity when the caller explicitly updates last_seen_at.
  if new.last_seen_at is distinct from old.last_seen_at then
    new.last_seen_at := server_now;
  end if;

  return new;
end;
$$;

drop trigger if exists nubyx_device_server_timestamp_guard on public.user_devices;

create trigger nubyx_device_server_timestamp_guard
before insert or update of created_at, last_seen_at
on public.user_devices
for each row
execute function public.nubyx_device_server_timestamps();

-- Trigger functions are internal database guards, not application RPCs.
revoke all on function public.nubyx_device_server_timestamps() from public;
revoke all on function public.nubyx_device_server_timestamps() from anon;
revoke all on function public.nubyx_device_server_timestamps() from authenticated;

comment on function public.nubyx_device_server_timestamps() is
  'Makes trusted-device creation/activity timestamps server authoritative and keeps created_at immutable.';
