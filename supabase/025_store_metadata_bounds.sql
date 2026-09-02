-- NUBYX Store metadata bounds
-- Keeps installed-app rows compact and predictable for API, sync and backups.
-- Constraints are NOT VALID so new/updated rows are protected immediately
-- without blocking deployment on historical data that may need cleanup first.

alter table public.user_apps
  drop constraint if exists user_apps_app_key_size_chk,
  add constraint user_apps_app_key_size_chk
    check (char_length(app_key) between 1 and 120) not valid;

alter table public.user_apps
  drop constraint if exists user_apps_app_name_size_chk,
  add constraint user_apps_app_name_size_chk
    check (char_length(app_name) between 1 and 160) not valid;

alter table public.user_apps
  drop constraint if exists user_apps_app_url_size_chk,
  add constraint user_apps_app_url_size_chk
    check (char_length(app_url) between 1 and 2048) not valid;

alter table public.user_apps
  drop constraint if exists user_apps_position_range_chk,
  add constraint user_apps_position_range_chk
    check (position between 0 and 10000) not valid;

comment on constraint user_apps_app_key_size_chk on public.user_apps is
  'Bounds the stable Store app identity key for predictable indexing and sync payloads.';

comment on constraint user_apps_app_url_size_chk on public.user_apps is
  'Prevents unexpectedly large launch URLs from inflating installed-app rows and sync events.';
