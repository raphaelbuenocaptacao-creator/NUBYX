-- NUBYX Continuity: immutable sync cursor identity
-- Apply after 004_sync_cursors.sql.
--
-- A cursor represents one fixed (user, device, channel) checkpoint. Once a
-- row exists, clients and privileged maintenance paths must advance only the
-- checkpoint itself; reassigning that row to another user/device/channel would
-- blur audit history and could create cross-device continuity inconsistencies.

create or replace function public.nubyx_enforce_immutable_sync_cursor_identity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.id is distinct from old.id
     or new.user_id is distinct from old.user_id
     or new.device_id is distinct from old.device_id
     or new.channel is distinct from old.channel then
    raise exception 'NUBYX sync cursor identity is immutable'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.nubyx_enforce_immutable_sync_cursor_identity() from public;
revoke all on function public.nubyx_enforce_immutable_sync_cursor_identity() from anon;
revoke all on function public.nubyx_enforce_immutable_sync_cursor_identity() from authenticated;

drop trigger if exists nubyx_sync_cursor_identity_guard on public.sync_cursors;
create trigger nubyx_sync_cursor_identity_guard
before update of id, user_id, device_id, channel
on public.sync_cursors
for each row
execute function public.nubyx_enforce_immutable_sync_cursor_identity();

comment on function public.nubyx_enforce_immutable_sync_cursor_identity() is
  'Keeps each Continuity cursor permanently bound to its original NUBYX ID, device and channel.';
