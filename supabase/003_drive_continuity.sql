-- NUBYX Drive Continuity
-- Emits authoritative per-user sync events whenever Drive metadata changes.
-- Prerequisites: supabase/schema.sql and supabase/002_device_sync.sql.
-- Safe to re-run.

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

  -- sync_events is protected by RLS. The originating authenticated user must
  -- own row_data.user_id; device_id remains null because this event is emitted
  -- authoritatively by the database rather than trusted from browser state.
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

drop trigger if exists files_meta_emit_sync_event on public.files_meta;
create trigger files_meta_emit_sync_event
after insert or update or delete on public.files_meta
for each row execute function public.emit_drive_sync_event();

comment on function public.emit_drive_sync_event() is
  'Emits NUBYX Continuity file events after authenticated Drive metadata mutations.';
