-- NUBYX Drive: suppress no-op continuity events
-- Apply after supabase/003_drive_continuity.sql and 021_drive_metadata_integrity.sql.
-- Safe to re-run.
--
-- Drive updates refresh updated_at on the server. Without this guard, an UPDATE
-- that does not change user-visible file metadata still creates a sync event,
-- adding avoidable fan-out and cursor churn as the product scales.

create or replace function public.emit_drive_sync_event()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  row_data public.files_meta;
  action text;
  event_payload jsonb;
begin
  if tg_op = 'UPDATE'
     and new.name is not distinct from old.name
     and new.mime_type is not distinct from old.mime_type
     and new.size_bytes is not distinct from old.size_bytes
     and new.folder is not distinct from old.folder
     and new.storage_path is not distinct from old.storage_path then
    return new;
  end if;

  if tg_op = 'DELETE' then
    row_data := old;
    action := 'delete';
    event_payload := jsonb_build_object(
      'id', old.id,
      'name', old.name,
      'folder', old.folder
    );
  else
    row_data := new;
    action := 'upsert';
    event_payload := jsonb_build_object(
      'id', new.id,
      'name', new.name,
      'mime_type', new.mime_type,
      'size_bytes', new.size_bytes,
      'folder', new.folder,
      'storage_path', new.storage_path,
      'updated_at', new.updated_at
    );
  end if;

  insert into public.sync_events (
    user_id,
    device_id,
    channel,
    entity_key,
    event_type,
    version,
    payload
  ) values (
    row_data.user_id,
    null,
    'files',
    row_data.id::text,
    action,
    greatest(1, floor(extract(epoch from clock_timestamp()) * 1000)::bigint),
    event_payload
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

comment on function public.emit_drive_sync_event() is
  'Emits NUBYX Continuity file events only when synchronized Drive metadata meaningfully changes.';
