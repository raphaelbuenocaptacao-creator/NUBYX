-- NUBYX Continuity: bound sync event payload size for safer scaling
-- Apply after 002_device_sync.sql.
--
-- sync_events is an append-only, realtime-backed stream. Unbounded JSON payloads
-- can amplify database, network and Realtime costs. Reject oversized future
-- events without rewriting or validating historical rows.

create or replace function public.nubyx_guard_sync_event_payload_size()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  payload_bytes integer;
begin
  payload_bytes := octet_length(new.payload::text);

  if payload_bytes > 262144 then
    raise exception 'sync event payload exceeds 256 KiB limit'
      using errcode = '22001';
  end if;

  return new;
end;
$$;

revoke all on function public.nubyx_guard_sync_event_payload_size() from public;

drop trigger if exists nubyx_sync_event_payload_size_guard on public.sync_events;

create trigger nubyx_sync_event_payload_size_guard
before insert on public.sync_events
for each row
execute function public.nubyx_guard_sync_event_payload_size();

comment on function public.nubyx_guard_sync_event_payload_size() is
  'Rejects future NUBYX sync events whose JSON payload exceeds 256 KiB.';

comment on trigger nubyx_sync_event_payload_size_guard on public.sync_events is
  'Bounds per-event storage and Realtime fan-out cost without touching historical sync rows.';
