-- NUBYX Continuity: lock checkpoint identity and ownership
-- Apply after 004_sync_cursors.sql.
--
-- RLS protects normal browser traffic, but privileged workers can bypass RLS.
-- A checkpoint must always belong to its device owner, and an existing cursor
-- must not be repurposed to another user, device or channel.

create or replace function public.nubyx_enforce_sync_cursor_identity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not exists (
    select 1
    from public.user_devices d
    where d.id = new.device_id
      and d.user_id = new.user_id
  ) then
    raise exception 'NUBYX sync cursor device does not belong to cursor user'
      using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' and (
    new.user_id is distinct from old.user_id
    or new.device_id is distinct from old.device_id
    or new.channel is distinct from old.channel
  ) then
    raise exception 'NUBYX sync cursor identity is immutable'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.nubyx_enforce_sync_cursor_identity() from public;
revoke all on function public.nubyx_enforce_sync_cursor_identity() from anon;
revoke all on function public.nubyx_enforce_sync_cursor_identity() from authenticated;

drop trigger if exists nubyx_sync_cursor_identity_guard on public.sync_cursors;
create trigger nubyx_sync_cursor_identity_guard
before insert or update of user_id, device_id, channel
on public.sync_cursors
for each row
execute function public.nubyx_enforce_sync_cursor_identity();

comment on function public.nubyx_enforce_sync_cursor_identity() is
  'Defense-in-depth guard: Continuity checkpoints stay bound to their original user, device and channel, including privileged writes that bypass RLS.';
