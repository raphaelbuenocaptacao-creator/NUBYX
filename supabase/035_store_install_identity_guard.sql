-- NUBYX Store install-record integrity
-- Preserve immutable audit identity for each installed app row.
-- Ownership and app_key were already immutable; this extends the guard to the
-- row id and original installed_at timestamp so a modified client cannot
-- rewrite the identity/history of an existing launcher entry.

create or replace function public.nubyx_guard_user_app_identity()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.id is distinct from old.id then
    raise exception 'user_apps.id is immutable';
  end if;

  if new.user_id is distinct from old.user_id then
    raise exception 'user_apps.user_id is immutable';
  end if;

  if new.app_key is distinct from old.app_key then
    raise exception 'user_apps.app_key is immutable';
  end if;

  if new.installed_at is distinct from old.installed_at then
    raise exception 'user_apps.installed_at is immutable';
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
  'Preserves Store row id, owner, app identity and original install timestamp after creation.';
