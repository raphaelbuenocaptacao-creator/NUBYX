-- NUBYX ID identity integrity
-- Keep the profile permanently bound to its Auth user and make the creation
-- timestamp server-authoritative, including privileged backend paths that may
-- bypass RLS.
--
-- This migration does not rewrite historical rows.

create or replace function public.guard_nubyx_profile_identity()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at = now();
    return new;
  end if;

  if new.id is distinct from old.id then
    raise exception 'NUBYX ID profile identity is immutable';
  end if;

  if new.created_at is distinct from old.created_at then
    raise exception 'NUBYX ID profile created_at is immutable';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_identity_integrity_guard on public.profiles;
create trigger profiles_identity_integrity_guard
before insert or update on public.profiles
for each row execute function public.guard_nubyx_profile_identity();

comment on function public.guard_nubyx_profile_identity()
  is 'Keeps NUBYX ID profiles bound to their original Auth user and protects server creation timestamps.';
