-- NUBYX Drive: metadata identity and audit integrity
-- Apply after schema.sql and preceding NUBYX migrations.
-- Safe to re-run.
--
-- Drive records are user-owned through RLS, but identity/audit fields should
-- still be server-controlled so a modified client cannot re-key a file record,
-- move its ownership, or forge creation/update timestamps.

create or replace function public.nubyx_guard_drive_metadata_integrity()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.updated_at := now();
    return new;
  end if;

  if new.id is distinct from old.id then
    raise exception 'NUBYX Drive file id is immutable' using errcode = '22023';
  end if;

  if new.user_id is distinct from old.user_id then
    raise exception 'NUBYX Drive file owner is immutable' using errcode = '22023';
  end if;

  -- Preserve creation time even if a modified client sends a different value.
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.nubyx_guard_drive_metadata_integrity() from public;

drop trigger if exists nubyx_files_meta_integrity_guard on public.files_meta;
create trigger nubyx_files_meta_integrity_guard
before insert or update on public.files_meta
for each row
execute function public.nubyx_guard_drive_metadata_integrity();

comment on function public.nubyx_guard_drive_metadata_integrity() is
  'Keeps NUBYX Drive metadata ownership/identity stable and creation/update timestamps server-controlled.';
