-- NUBYX Continuity: idempotent publish keys
-- Apply after 002_device_sync.sql.
-- Prevents duplicate sync_events when the same client operation is retried.

alter table public.sync_events
  add column if not exists client_event_key uuid;

create unique index if not exists sync_events_user_device_client_key_uidx
  on public.sync_events (user_id, device_id, client_event_key)
  where client_event_key is not null;

comment on column public.sync_events.client_event_key is
  'Client-generated idempotency key. Reusing the same key on a retry must not create another logical event.';
