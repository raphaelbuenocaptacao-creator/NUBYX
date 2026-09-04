-- NUBYX Continuity: irreversible trusted-device revocation
-- Apply after 002_device_sync.sql and 012_sync_device_ownership_guard.sql.
--
-- Adds a server-enforced revocation state without changing existing active devices.
-- Once a device is revoked it cannot be silently reactivated, and revoked devices
-- cannot publish new sync events even through privileged write paths.

alter table public.user_devices
  add column if not exists revoked_at timestamptz;

create or replace function public.nubyx_enforce_device_revocation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at then
    raise exception 'NUBYX device revocation is permanent'
      using errcode = '23514';
  end if;

  if old.revoked_at is null and new.revoked_at is not null then
    new.revoked_at := now();
  end if;

  return new;
end;
$$;

revoke all on function public.nubyx_enforce_device_revocation() from public;

drop trigger if exists nubyx_device_revocation_guard on public.user_devices;
create trigger nubyx_device_revocation_guard
before update of revoked_at
on public.user_devices
for each row
execute function public.nubyx_enforce_device_revocation();

create or replace function public.nubyx_enforce_sync_device_ownership()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.device_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.user_devices d
    where d.id = new.device_id
      and d.user_id = new.user_id
      and d.revoked_at is null
  ) then
    raise exception 'NUBYX sync device is revoked or does not belong to event user'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.nubyx_enforce_sync_device_ownership() from public;

comment on column public.user_devices.revoked_at is
  'Permanent server-normalized revocation timestamp. Revoked devices cannot publish new Continuity events.';

comment on function public.nubyx_enforce_device_revocation() is
  'Makes trusted-device revocation irreversible and normalizes the revocation timestamp on the server.';
