-- NUBYX Store installation timestamp integrity
-- Ensure installed_at is always assigned by the database on INSERT.
-- Migration 035 already makes installed_at immutable after creation; this closes
-- the remaining gap where a modified client could forge the original install time.

create or replace function public.nubyx_set_user_app_installed_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.installed_at = now();
  return new;
end;
$$;

drop trigger if exists trg_nubyx_set_user_app_installed_at on public.user_apps;
create trigger trg_nubyx_set_user_app_installed_at
before insert on public.user_apps
for each row
execute function public.nubyx_set_user_app_installed_at();

comment on function public.nubyx_set_user_app_installed_at() is
  'Assigns Store install timestamps on the server so clients cannot forge installation history.';
