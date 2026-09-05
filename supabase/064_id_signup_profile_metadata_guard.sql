-- NUBYX ID signup profile metadata guard
-- Keeps Auth user creation resilient when untrusted signup metadata contains
-- an oversized or whitespace-only display_name.
--
-- The profiles table already caps display_name at 120 characters. Normalize
-- the Auth metadata before inserting so the profile trigger cannot turn a
-- malformed display name into a failed signup/profile bootstrap.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  safe_display_name text;
begin
  safe_display_name := nullif(
    left(
      btrim(coalesce(new.raw_user_meta_data ->> 'display_name', '')),
      120
    ),
    ''
  );

  insert into public.profiles (id, display_name)
  values (new.id, safe_display_name)
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public;
revoke all on function public.handle_new_user() from anon;
revoke all on function public.handle_new_user() from authenticated;

comment on function public.handle_new_user() is
  'Bootstraps a NUBYX profile from Auth with normalized, bounded display-name metadata.';
