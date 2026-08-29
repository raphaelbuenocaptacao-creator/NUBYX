-- NUBYX Continuity: enforce user/device integrity at the database boundary
-- Apply after 002_device_sync.sql.
--
-- RLS already protects normal authenticated inserts, but service-role jobs,
-- future backend workers and maintenance scripts can bypass RLS. This trigger
-- keeps sync_events.user_id and sync_events.device_id consistent in every path.

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
  ) then
    raise exception 'NUBYX sync device does not belong to event user'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.nubyx_enforce_sync_device_ownership() from public;

drop trigger if exists nubyx_sync_device_ownership_guard on public.sync_events;
create trigger nubyx_sync_device_ownership_guard
before insert or update of user_id, device_id
on public.sync_events
for each row
execute function public.nubyx_enforce_sync_device_ownership();

comment on function public.nubyx_enforce_sync_device_ownership() is
  'Defense-in-depth guard ensuring every non-null sync_events.device_id belongs to sync_events.user_id, including writes that bypass RLS.';
