-- NUBYX launcher + Drive query indexes
-- Supports the exact authenticated read patterns used by the current PWA:
--   user_apps: user_id filter + position ordering
--   files_meta: user_id/folder filter + newest-first ordering
-- These indexes improve per-user latency as installations and Drive metadata grow.

create index if not exists user_apps_user_position_idx
  on public.user_apps (user_id, position, app_key);

create index if not exists files_meta_user_folder_created_idx
  on public.files_meta (user_id, folder, created_at desc);

comment on index public.user_apps_user_position_idx is
  'Serves NUBYX Home/Store launcher reads scoped by user and ordered by position.';

comment on index public.files_meta_user_folder_created_idx is
  'Serves NUBYX Drive folder listings scoped by user and ordered newest first.';
