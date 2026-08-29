-- NUBYX user-owned content limits
-- Bounds mutable profile/workspace/file/app fields so one authenticated user
-- cannot create unexpectedly large rows that degrade API, Realtime or backups.
--
-- Constraints are added NOT VALID: PostgreSQL enforces them for new/updated
-- rows immediately without blocking deployment on historical data. Validate
-- each constraint separately after auditing existing rows.

alter table public.profiles
  drop constraint if exists profiles_display_name_size_chk,
  add constraint profiles_display_name_size_chk
    check (display_name is null or char_length(display_name) <= 120) not valid;

alter table public.profiles
  drop constraint if exists profiles_avatar_url_size_chk,
  add constraint profiles_avatar_url_size_chk
    check (avatar_url is null or char_length(avatar_url) <= 2048) not valid;

alter table public.profiles
  drop constraint if exists profiles_wallpaper_size_chk,
  add constraint profiles_wallpaper_size_chk
    check (char_length(wallpaper) between 1 and 80) not valid;

-- Workspace state is intentionally larger than a Continuity event because it
-- represents a full snapshot. 256 KiB keeps snapshots practical on mobile
-- while preventing unbounded JSON documents.
alter table public.workspace_state
  drop constraint if exists workspace_state_payload_size_chk,
  add constraint workspace_state_payload_size_chk
    check (pg_column_size(state) <= 262144) not valid;

alter table public.files_meta
  drop constraint if exists files_meta_folder_size_chk,
  add constraint files_meta_folder_size_chk
    check (char_length(folder) between 1 and 1024) not valid;

alter table public.files_meta
  drop constraint if exists files_meta_mime_type_size_chk,
  add constraint files_meta_mime_type_size_chk
    check (mime_type is null or char_length(mime_type) <= 255) not valid;

alter table public.user_apps
  drop constraint if exists user_apps_icon_size_chk,
  add constraint user_apps_icon_size_chk
    check (icon is null or char_length(icon) <= 2048) not valid;

comment on constraint workspace_state_payload_size_chk on public.workspace_state is
  'Caps each per-user workspace snapshot at 256 KiB to protect API, sync and backup performance.';
