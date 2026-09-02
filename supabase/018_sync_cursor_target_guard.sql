-- NUBYX Continuity: validate sync cursor targets and use server timestamps
-- Apply after 010_monotonic_sync_cursors.sql and 016_sync_server_timestamps.sql.
--
-- A client must never be able to advance a per-channel cursor to an arbitrary
-- bigint. Doing so could make that device permanently skip legitimate future
-- events. For non-zero cursors, require the target event to exist and belong to
-- the same user + channel, while preserving monotonic progress.

create or replace function public.nubyx_keep_sync_cursor_monotonic()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  requested_event_id bigint;
begin
  requested_event_id := greatest(coalesce(new.last_event_id, 0), 0);

  if tg_op = 'UPDATE' then
    requested_event_id := greatest(coalesce(old.last_event_id, 0), requested_event_id);
  end if;

  if requested_event_id > 0 and not exists (
    select 1
    from public.sync_events e
    where e.id = requested_event_id
      and e.user_id = new.user_id
      and e.channel = new.channel
  ) then
    raise exception using
      errcode = '23514',
      message = 'sync cursor target must reference an event owned by the same user and channel';
  end if;

  new.last_event_id := requested_event_id;
  new.updated_at := statement_timestamp();
  return new;
end;
$$;

revoke all on function public.nubyx_keep_sync_cursor_monotonic() from public;
revoke all on function public.nubyx_keep_sync_cursor_monotonic() from anon;
revoke all on function public.nubyx_keep_sync_cursor_monotonic() from authenticated;

drop trigger if exists nubyx_sync_cursors_monotonic on public.sync_cursors;
create trigger nubyx_sync_cursors_monotonic
before insert or update of last_event_id, updated_at, user_id, channel
on public.sync_cursors
for each row
execute function public.nubyx_keep_sync_cursor_monotonic();

comment on function public.nubyx_keep_sync_cursor_monotonic() is
  'Keeps Continuity cursors monotonic, validates non-zero targets against the same user/channel event stream, and forces updated_at to database time.';
