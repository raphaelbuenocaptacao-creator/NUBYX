-- NUBYX Continuity: immutable device identity
-- Apply after 002_device_sync.sql.
--
-- A registered device row is referenced by synchronization events and cursors.
-- Its identity fields must remain stable after enrollment; clients may update
-- descriptive metadata such as device_name/platform, but may not re-key the row
-- or move it to another account.

create or replace function public.nubyx_guard_device_identity()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.id is distinct from old.id then
    raise exception 'NUBYX device id is immutable' using errcode = '22023';
  end if;

  if new.user_id is distinct from old.user_id then
    raise exception 'NUBYX device owner is immutable' using errcode = '22023';
  end if;

  if new.device_key is distinct from old.device_key then
    raise exception 'NUBYX device key is immutable' using errcode = '22023';
  end if;

  return new;
end;
$$;

revoke all on function public.nubyx_guard_device_identity() from public;

drop trigger if exists nubyx_user_devices_identity_guard on public.user_devices;
create trigger nubyx_user_devices_identity_guard
before update on public.user_devices
for each row
execute function public.nubyx_guard_device_identity();

comment on function public.nubyx_guard_device_identity() is
  'Keeps user_devices id, owner and device_key immutable after enrollment while allowing metadata and server-managed presence updates.';
