-- NUBYX Continuity: keep registered device identity immutable
-- Apply after 028_server_device_activity.sql.
--
-- A device may refresh mutable metadata (name, platform, user agent), but its
-- database id, owning NUBYX ID and stable device key must not be rewritten.
-- Keeping these fields stable preserves sync attribution and audit continuity.

create or replace function public.nubyx_stamp_device_activity()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'INSERT' then
    -- Registration timestamps are always server-authored.
    new.created_at := now();
    new.last_seen_at := now();
    return new;
  end if;

  -- Preserve the registered device identity across metadata/activity updates.
  new.id := old.id;
  new.user_id := old.user_id;
  new.device_key := old.device_key;
  new.created_at := old.created_at;
  new.last_seen_at := now();
  return new;
end;
$$;

revoke all on function public.nubyx_stamp_device_activity() from public;

comment on function public.nubyx_stamp_device_activity() is
  'Makes device id, owner, device key and registration time immutable while keeping last_seen_at server-authoritative for NUBYX Continuity.';
