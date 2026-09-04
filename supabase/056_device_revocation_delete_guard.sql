-- NUBYX Continuity: prevent revocation bypass via delete + re-register
-- Apply after 055_device_revocation_guard.sql.
--
-- A revoked device row is intentionally permanent. Without this guard, an owner
-- could delete the revoked row and register the same device_key again, bypassing
-- the irreversible revocation state introduced in migration 055.

create or replace function public.nubyx_prevent_revoked_device_delete()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if old.revoked_at is not null then
    raise exception 'NUBYX revoked devices cannot be deleted'
      using errcode = '23514';
  end if;

  return old;
end;
$$;

revoke all on function public.nubyx_prevent_revoked_device_delete() from public;

drop trigger if exists nubyx_revoked_device_delete_guard on public.user_devices;
create trigger nubyx_revoked_device_delete_guard
before delete
on public.user_devices
for each row
execute function public.nubyx_prevent_revoked_device_delete();

-- Keep the normal owner-delete behavior only for active devices.
drop policy if exists "devices own rows delete" on public.user_devices;
create policy "devices own active rows delete" on public.user_devices
for delete to authenticated
using (
  (select auth.uid()) = user_id
  and revoked_at is null
);

comment on function public.nubyx_prevent_revoked_device_delete() is
  'Prevents a revoked trusted-device record from being deleted and re-registered to bypass permanent revocation.';
