-- NUBYX Continuity: cursor-aware event retention
-- Apply after 004_sync_cursors.sql and 005_sync_retention.sql.
--
-- Retention must not remove an event that an active device has not confirmed yet.
-- A device is considered active when it has been seen within the configured
-- retention window. Missing cursors are treated conservatively as unconfirmed.

create or replace function public.nubyx_prune_sync_events(
  retention interval default interval '30 days',
  batch_size integer default 10000
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  deleted_count integer := 0;
begin
  if retention is null or retention < interval '1 day' then
    raise exception 'retention must be at least 1 day';
  end if;

  if batch_size is null or batch_size < 1 or batch_size > 50000 then
    raise exception 'batch_size must be between 1 and 50000';
  end if;

  with victims as (
    select events.id
    from public.sync_events events
    where events.created_at < now() - retention
      and not exists (
        select 1
        from public.user_devices devices
        where devices.user_id = events.user_id
          and devices.last_seen_at >= now() - retention
          and not exists (
            select 1
            from public.sync_cursors cursors
            where cursors.user_id = events.user_id
              and cursors.device_id = devices.id
              and cursors.channel = events.channel
              and cursors.last_event_id >= events.id
          )
      )
    order by events.created_at asc, events.id asc
    limit batch_size
  )
  delete from public.sync_events events
  using victims
  where events.id = victims.id;

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

-- Keep destructive maintenance unavailable to browser sessions.
revoke all on function public.nubyx_prune_sync_events(interval, integer) from public;
revoke all on function public.nubyx_prune_sync_events(interval, integer) from anon;
revoke all on function public.nubyx_prune_sync_events(interval, integer) from authenticated;
grant execute on function public.nubyx_prune_sync_events(interval, integer) to service_role;

comment on function public.nubyx_prune_sync_events(interval, integer) is
  'Deletes old NUBYX Continuity events in bounded batches only after active devices have confirmed the corresponding channel cursor. Service role only.';
