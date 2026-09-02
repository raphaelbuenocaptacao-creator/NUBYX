-- NUBYX Continuity: make device activity timestamps server-authoritative
-- Apply after 002_device_sync.sql and 027_sync_prune_cursor_floor.sql.
--
-- Cursor-aware retention uses user_devices.last_seen_at to decide whether a
-- device is active. Browser clients must not be able to pin that timestamp in
-- the future and keep old sync events from being pruned indefinitely.

create or replace function public.nubyx_stamp_device_activity()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'INSERT' then
    -- Device identity is created now, regardless of client-supplied timestamps.
    new.created_at := now();
    new.last_seen_at := now();
    return new;
  end if;

  -- Preserve registration time and let the database own the activity clock.
  new.created_at := old.created_at;
  new.last_seen_at := now();
  return new;
end;
$$;

revoke all on function public.nubyx_stamp_device_activity() from public;

drop trigger if exists nubyx_user_devices_activity_stamp on public.user_devices;
create trigger nubyx_user_devices_activity_stamp
before insert or update on public.user_devices
for each row
execute function public.nubyx_stamp_device_activity();

comment on function public.nubyx_stamp_device_activity() is
  'Makes user_devices.created_at immutable and last_seen_at server-authoritative so clients cannot manipulate Continuity retention activity windows.';
