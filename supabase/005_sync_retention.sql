-- NUBYX Continuity: bounded sync-event retention for scale
-- Apply after 002_device_sync.sql. This migration does not schedule deletion by itself.
-- It only exposes a service-role-only maintenance function that infrastructure may call.

create index if not exists sync_events_created_at_id_idx
  on public.sync_events (created_at, id);

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
    select id
    from public.sync_events
    where created_at < now() - retention
    order by created_at asc, id asc
    limit batch_size
  )
  delete from public.sync_events events
  using victims
  where events.id = victims.id;

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

-- Never expose destructive maintenance to browser sessions.
revoke all on function public.nubyx_prune_sync_events(interval, integer) from public;
revoke all on function public.nubyx_prune_sync_events(interval, integer) from anon;
revoke all on function public.nubyx_prune_sync_events(interval, integer) from authenticated;
grant execute on function public.nubyx_prune_sync_events(interval, integer) to service_role;

comment on function public.nubyx_prune_sync_events(interval, integer) is
  'Deletes old NUBYX Continuity events in bounded batches. Service role only; scheduling belongs to backend infrastructure.';
