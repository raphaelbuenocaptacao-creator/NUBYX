-- NUBYX Continuity: make sync history append-only at the database boundary
-- Apply after 002_device_sync.sql.
--
-- RLS prevents normal authenticated clients from updating sync_events, but
-- privileged workers/service-role code can bypass RLS. Historical sync events
-- are audit records and corrections must be represented by new events, so an
-- UPDATE must never rewrite an existing row. Retention jobs may still DELETE
-- old rows according to the retention policy.

create or replace function public.nubyx_reject_sync_event_update()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  raise exception 'NUBYX sync history is append-only; create a new event instead of updating an existing one'
    using errcode = '55000';
end;
$$;

revoke all on function public.nubyx_reject_sync_event_update() from public;

drop trigger if exists nubyx_sync_events_append_only_guard on public.sync_events;
create trigger nubyx_sync_events_append_only_guard
before update on public.sync_events
for each row
execute function public.nubyx_reject_sync_event_update();

comment on function public.nubyx_reject_sync_event_update() is
  'Defense-in-depth guard that prevents historical sync_events rows from being rewritten, including privileged writes that bypass RLS.';
