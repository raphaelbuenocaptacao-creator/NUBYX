-- NUBYX ID: keep profile audit timestamps authoritative.
-- created_at is assigned by the database on insert and remains immutable.
-- updated_at continues to be assigned by the database on every update.

create or replace function public.nubyx_profile_timestamp_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := pg_catalog.now();
    new.updated_at := pg_catalog.now();
    return new;
  end if;

  new.created_at := old.created_at;
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

revoke all on function public.nubyx_profile_timestamp_guard() from public;
revoke all on function public.nubyx_profile_timestamp_guard() from anon;
revoke all on function public.nubyx_profile_timestamp_guard() from authenticated;

drop trigger if exists profiles_timestamp_guard on public.profiles;
create trigger profiles_timestamp_guard
before insert or update on public.profiles
for each row execute function public.nubyx_profile_timestamp_guard();

-- The older generic updated_at trigger becomes redundant for profiles.
drop trigger if exists profiles_set_updated_at on public.profiles;
