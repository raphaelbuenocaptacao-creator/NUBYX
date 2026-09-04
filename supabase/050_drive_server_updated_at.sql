-- NUBYX Drive authoritative update timestamps
-- Prevents clients from choosing files_meta.updated_at on INSERT.
-- UPDATE is already protected by files_meta_set_updated_at from schema.sql.
-- Existing rows are not modified. Safe to re-run after supabase/schema.sql.

create or replace function public.set_drive_initial_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists files_meta_set_initial_updated_at on public.files_meta;
create trigger files_meta_set_initial_updated_at
before insert on public.files_meta
for each row execute function public.set_drive_initial_updated_at();

comment on function public.set_drive_initial_updated_at() is
  'Assigns the initial NUBYX Drive updated_at timestamp from the database server so clients cannot forge file recency at creation time.';
