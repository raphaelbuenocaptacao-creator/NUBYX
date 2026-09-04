-- NUBYX Drive logical folder path hardening
-- Apply after schema.sql and 008_user_content_limits.sql.
-- Safe to re-run.
--
-- storage_path is already constrained to the owning user's Storage namespace.
-- This guard protects the logical Drive folder used by the launcher/UI so
-- clients cannot persist relative paths or parent-directory traversal tokens.
-- NOT VALID avoids blocking deployment on historical rows while PostgreSQL
-- still enforces the rule for every new or updated row.

alter table public.files_meta
  drop constraint if exists files_meta_folder_path_check;

alter table public.files_meta
  add constraint files_meta_folder_path_check
  check (
    left(folder, 1) = '/'
    and folder !~ '(^|/)\.\.?(/|$)'
    and position(E'\\' in folder) = 0
  ) not valid;

comment on constraint files_meta_folder_path_check on public.files_meta is
  'Requires canonical absolute logical Drive folders and rejects dot-segment traversal or backslash path separators.';
