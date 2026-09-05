-- NUBYX Drive server-side file size guard
-- Aligns the database and private Storage bucket with the 25 MB limit enforced by the PWA.
-- Existing oversized metadata rows are preserved until audited because the constraint is NOT VALID.
-- Safe to re-run.

update storage.buckets
set file_size_limit = 26214400
where id = 'nubyx-user-files';

alter table public.files_meta
  drop constraint if exists files_meta_size_bytes_max_chk;

alter table public.files_meta
  add constraint files_meta_size_bytes_max_chk
  check (size_bytes between 0 and 26214400) not valid;

comment on constraint files_meta_size_bytes_max_chk on public.files_meta is
  'Caps NUBYX Drive metadata at 25 MiB per file, matching the private Storage bucket and PWA upload limit.';
