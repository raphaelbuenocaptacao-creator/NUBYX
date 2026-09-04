-- NUBYX Continuity: authoritative server timestamps for append-only sync events
-- Prevents clients from backdating or future-dating synchronization history.

create or replace function public.nubyx_enforce_sync_event_created_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.created_at := now();
  return new;
end;
$$;

revoke all on function public.nubyx_enforce_sync_event_created_at() from public;

drop trigger if exists nubyx_sync_event_created_at_guard on public.sync_events;
create trigger nubyx_sync_event_created_at_guard
before insert on public.sync_events
for each row
execute function public.nubyx_enforce_sync_event_created_at();

comment on function public.nubyx_enforce_sync_event_created_at() is
  'Assigns sync_events.created_at from the database clock so clients cannot forge event chronology.';
