-- NUBYX Continuity: keep device ownership stable after registration
-- Apply after 002_device_sync.sql.
--
-- RLS protects normal authenticated writes, but service-role jobs and future
-- backend workers can bypass RLS. Once a device row is registered, changing
-- user_id would silently transfer that device identity to another account and
-- could corrupt continuity, audit history and per-user sync assumptions.

create or replace function public.nubyx_guard_device_owner_immutable()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception 'user_id is immutable after device registration'
      using errcode = '22023';
  end if;

  return new;
end;
$$;

revoke all on function public.nubyx_guard_device_owner_immutable() from public;

drop trigger if exists nubyx_device_owner_immutable on public.user_devices;

create trigger nubyx_device_owner_immutable
before update on public.user_devices
for each row
execute function public.nubyx_guard_device_owner_immutable();

comment on function public.nubyx_guard_device_owner_immutable() is
  'Prevents a registered NUBYX Continuity device from being reassigned to another user.';

comment on trigger nubyx_device_owner_immutable on public.user_devices is
  'Keeps device ownership stable while allowing legitimate mutable device metadata.';
