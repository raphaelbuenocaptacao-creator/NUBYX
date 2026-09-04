-- NUBYX Drive authoritative creation timestamps
-- Prevents clients from choosing files_meta.created_at on INSERT.
-- Existing rows are not modified. Safe to re-run after supabase/schema.sql.

create or replace function public.set_drive_created_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.created_at = now();
  return new;
end;
$$;

drop trigger if exists files_meta_set_created_at on public.files_meta;
create trigger files_meta_set_created_at
before insert on public.files_meta
for each row execute function public.set_drive_created_at();

comment on function public.set_drive_created_at() is
  'Assigns NUBYX Drive file creation time from the database server on insert.';
