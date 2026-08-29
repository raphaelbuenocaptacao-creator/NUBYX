-- NUBYX Drive metadata hardening
-- Apply after schema.sql and the preceding NUBYX migrations.
-- Safe to re-run.
--
-- The PWA already refuses uploads larger than 25 MiB. These database
-- constraints mirror that boundary for Drive metadata so a modified client
-- cannot register oversized or pathological file records.
--
-- NOT VALID avoids blocking deployment on historical rows while PostgreSQL
-- immediately enforces the constraints for all new or updated rows.

alter table public.files_meta
  drop constraint if exists files_meta_name_size_chk,
  add constraint files_meta_name_size_chk
    check (char_length(name) between 1 and 255) not valid;

alter table public.files_meta
  drop constraint if exists files_meta_storage_path_size_chk,
  add constraint files_meta_storage_path_size_chk
    check (char_length(storage_path) between 1 and 1024) not valid;

alter table public.files_meta
  drop constraint if exists files_meta_size_bytes_chk,
  add constraint files_meta_size_bytes_chk
    check (size_bytes is null or size_bytes between 0 and 26214400) not valid;

comment on constraint files_meta_name_size_chk on public.files_meta is
  'Bounds NUBYX Drive filenames to 255 characters.';

comment on constraint files_meta_storage_path_size_chk on public.files_meta is
  'Bounds private Storage object paths to 1024 characters.';

comment on constraint files_meta_size_bytes_chk on public.files_meta is
  'Mirrors the PWA 25 MiB per-file limit at the Drive metadata boundary.';
