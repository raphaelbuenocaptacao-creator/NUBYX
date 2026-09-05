-- NUBYX Continuity: harden privileged sync-retention execution context
-- Apply after 005_sync_retention.sql.
--
-- nubyx_prune_sync_events() is intentionally SECURITY DEFINER because only
-- backend maintenance should delete retained sync history. Pinning search_path
-- to pg_catalog first reduces object-shadowing risk while preserving the
-- service-role-only execution model and the existing bounded-delete behavior.

create or replace function public.nubyx_prune_sync_events(
  retention interval default interval '30 days',
  batch_size integer default 10000
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
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
    where created_at < pg_catalog.now() - retention
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

-- Keep destructive maintenance unavailable to browser sessions.
revoke all on function public.nubyx_prune_sync_events(interval, integer) from public;
revoke all on function public.nubyx_prune_sync_events(interval, integer) from anon;
revoke all on function public.nubyx_prune_sync_events(interval, integer) from authenticated;
grant execute on function public.nubyx_prune_sync_events(interval, integer) to service_role;

comment on function public.nubyx_prune_sync_events(interval, integer) is
  'Deletes old NUBYX Continuity events in bounded batches; SECURITY DEFINER with a pinned pg_catalog-first search_path; service role only.';
