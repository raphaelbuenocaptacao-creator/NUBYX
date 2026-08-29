-- NUBYX Continuity: bounded event payloads for predictable sync cost
-- Apply after 002_device_sync.sql.
--
-- The browser already emits compact JSON objects, but database-side limits are the
-- final trust boundary. NOT VALID avoids blocking deployment if historical rows
-- contain oversized payloads; PostgreSQL still enforces the constraint for all
-- new/updated rows immediately. Validate later after auditing legacy data.

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'sync_events_payload_size_check'
      and conrelid = 'public.sync_events'::regclass
  ) then
    alter table public.sync_events
      add constraint sync_events_payload_size_check
      check (octet_length(payload::text) <= 65536) not valid;
  end if;
end;
$$;

comment on constraint sync_events_payload_size_check on public.sync_events is
  'Caps each Continuity JSON payload at 64 KiB to protect storage, Realtime delivery, replay latency, and client memory.';
