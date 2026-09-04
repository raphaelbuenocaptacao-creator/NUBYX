-- NUBYX Drive ownership hardening
-- Apply after schema.sql and 007_multiuser_integrity.sql.
-- Safe to re-run.
--
-- RLS remains the primary authorization boundary. This trigger adds
-- defense-in-depth for privileged backend paths that can bypass RLS.

create or replace function public.prevent_files_meta_owner_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception 'NUBYX Drive file ownership is immutable'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists files_meta_owner_immutable on public.files_meta;
create trigger files_meta_owner_immutable
before update on public.files_meta
for each row execute function public.prevent_files_meta_owner_change();

comment on function public.prevent_files_meta_owner_change() is
  'Prevents an existing NUBYX Drive metadata row from being reassigned to another user, including through privileged backend paths that bypass RLS.';
