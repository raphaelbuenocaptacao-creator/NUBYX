-- NUBYX Drive metadata identity guard
-- Keeps a Drive metadata row permanently bound to the authenticated owner
-- and the Storage object created for that row.
-- Safe to re-run after supabase/schema.sql.

create or replace function public.guard_drive_metadata_identity()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.id is distinct from old.id then
    raise exception 'NUBYX Drive file id is immutable';
  end if;

  if new.user_id is distinct from old.user_id then
    raise exception 'NUBYX Drive file owner is immutable';
  end if;

  if new.storage_path is distinct from old.storage_path then
    raise exception 'NUBYX Drive storage path is immutable';
  end if;

  if new.created_at is distinct from old.created_at then
    raise exception 'NUBYX Drive created_at is immutable';
  end if;

  return new;
end;
$$;

drop trigger if exists files_meta_guard_identity on public.files_meta;
create trigger files_meta_guard_identity
before update on public.files_meta
for each row execute function public.guard_drive_metadata_identity();

comment on function public.guard_drive_metadata_identity() is
  'Prevents Drive metadata updates from changing file identity, owner, Storage binding, or creation timestamp.';
