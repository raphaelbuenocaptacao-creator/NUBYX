-- NUBYX Drive metadata timestamp integrity
-- Makes Drive audit timestamps authoritative on the database side.
-- created_at is assigned by the server and cannot be rewritten by clients;
-- updated_at is refreshed by the server on every metadata update.
-- Safe to re-run.

create or replace function public.guard_files_meta_timestamps()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := clock_timestamp();
  else
    new.created_at := old.created_at;
  end if;

  new.updated_at := clock_timestamp();
  return new;
end;
$$;

-- Replace the generic timestamp trigger for files_meta with the stricter
-- Drive-specific guard so there is only one timestamp authority on the table.
drop trigger if exists files_meta_set_updated_at on public.files_meta;
drop trigger if exists files_meta_guard_timestamps on public.files_meta;

create trigger files_meta_guard_timestamps
before insert or update on public.files_meta
for each row execute function public.guard_files_meta_timestamps();

-- This function exists only for the trigger path; application roles do not
-- need direct EXECUTE permission.
revoke execute on function public.guard_files_meta_timestamps() from public;
revoke execute on function public.guard_files_meta_timestamps() from anon;
revoke execute on function public.guard_files_meta_timestamps() from authenticated;

comment on function public.guard_files_meta_timestamps() is
  'Keeps NUBYX Drive metadata created_at immutable and updated_at server-authoritative.';
