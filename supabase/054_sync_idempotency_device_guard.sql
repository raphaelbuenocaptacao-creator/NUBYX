-- NUBYX Continuity: make idempotency keys effective for future events
-- Apply after 009_sync_idempotency.sql.
--
-- The existing unique index is scoped by (user_id, device_id, client_event_key).
-- PostgreSQL treats NULL values as distinct in a unique index, so an idempotent
-- event carrying a client_event_key without a device_id could still be inserted
-- more than once. Future keyed events must therefore be tied to a concrete device.
-- NOT VALID keeps legacy rows deployable while enforcing the rule immediately
-- for new and updated rows.

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'sync_events_key_requires_device_check'
      and conrelid = 'public.sync_events'::regclass
  ) then
    alter table public.sync_events
      add constraint sync_events_key_requires_device_check
      check (client_event_key is null or device_id is not null) not valid;
  end if;
end;
$$;

comment on constraint sync_events_key_requires_device_check on public.sync_events is
  'Ensures idempotency-keyed Continuity events are attached to a device so the per-device unique key cannot be bypassed through NULL device_id.';
