-- NUBYX Store multi-user integrity
-- Installed app rows are user-owned records. Once created, their owner and
-- stable app key must not be reassigned by a modified or buggy client.

create or replace function public.nubyx_guard_user_app_identity()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception 'user_apps.user_id is immutable';
  end if;

  if new.app_key is distinct from old.app_key then
    raise exception 'user_apps.app_key is immutable';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_nubyx_guard_user_app_identity on public.user_apps;
create trigger trg_nubyx_guard_user_app_identity
before update on public.user_apps
for each row
execute function public.nubyx_guard_user_app_identity();

comment on function public.nubyx_guard_user_app_identity() is
  'Prevents installed Store records from being reassigned to another NUBYX ID or app identity after creation.';
