-- NUBYX Continuity: authoritative server timestamps for device registry
-- Prevents clients from forging device creation or activity chronology.

create or replace function public.nubyx_enforce_device_timestamps()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
  else
    new.created_at := old.created_at;
  end if;

  new.last_seen_at := now();
  return new;
end;
$$;

revoke all on function public.nubyx_enforce_device_timestamps() from public;

drop trigger if exists nubyx_device_timestamps_guard on public.user_devices;
create trigger nubyx_device_timestamps_guard
before insert or update on public.user_devices
for each row
execute function public.nubyx_enforce_device_timestamps();

comment on function public.nubyx_enforce_device_timestamps() is
  'Uses the database clock for user_devices creation/activity timestamps and keeps created_at immutable.';
