-- NUBYX Continuity: keep a registered device identity stable after creation
-- Apply after 002_device_sync.sql.
--
-- device_key is the durable client identifier used to reconnect the same device
-- across sessions. It may be chosen at INSERT time, but rewriting it later would
-- let one registered row silently assume another device identity and can confuse
-- cursors, audit history and cross-device continuity.

create or replace function public.nubyx_guard_device_key_immutable()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.device_key is distinct from old.device_key then
    raise exception 'device_key is immutable after device registration'
      using errcode = '22023';
  end if;

  return new;
end;
$$;

drop trigger if exists nubyx_device_key_immutable on public.user_devices;

create trigger nubyx_device_key_immutable
before update on public.user_devices
for each row
execute function public.nubyx_guard_device_key_immutable();

comment on function public.nubyx_guard_device_key_immutable() is
  'Prevents a registered NUBYX Continuity device from changing its durable device_key.';

comment on trigger nubyx_device_key_immutable on public.user_devices is
  'Keeps device identity stable while still allowing mutable metadata such as name and platform.';
