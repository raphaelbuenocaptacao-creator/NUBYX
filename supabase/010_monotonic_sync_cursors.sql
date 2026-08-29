-- NUBYX Continuity: monotonic device checkpoints
-- Apply after 004_sync_cursors.sql.
-- Prevents concurrent/out-of-order writes from moving a device cursor backwards.

create or replace function public.nubyx_keep_sync_cursor_monotonic()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    new.last_event_id := greatest(coalesce(old.last_event_id, 0), coalesce(new.last_event_id, 0));
  else
    new.last_event_id := greatest(coalesce(new.last_event_id, 0), 0);
  end if;

  new.updated_at := greatest(
    coalesce(new.updated_at, now()),
    coalesce(old.updated_at, '-infinity'::timestamptz)
  );

  return new;
end;
$$;

revoke all on function public.nubyx_keep_sync_cursor_monotonic() from public;
revoke all on function public.nubyx_keep_sync_cursor_monotonic() from anon;
revoke all on function public.nubyx_keep_sync_cursor_monotonic() from authenticated;

drop trigger if exists nubyx_sync_cursors_monotonic on public.sync_cursors;

create trigger nubyx_sync_cursors_monotonic
before insert or update of last_event_id, updated_at
on public.sync_cursors
for each row
execute function public.nubyx_keep_sync_cursor_monotonic();

comment on function public.nubyx_keep_sync_cursor_monotonic() is
  'Keeps per-device Continuity checkpoints monotonic so concurrent writes cannot replay already-consumed events.';
