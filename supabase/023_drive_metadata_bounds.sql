-- NUBYX Drive: bound client-controlled metadata
-- Apply after supabase/schema.sql.
-- Safe to re-run.
--
-- name and storage_path already have bounds in the base schema. mime_type and
-- folder are also client-controlled and participate in Drive sync payloads, so
-- keep them bounded to prevent oversized rows/events as the product scales.

alter table public.files_meta
  drop constraint if exists files_meta_mime_type_length_check;

alter table public.files_meta
  add constraint files_meta_mime_type_length_check
  check (mime_type is null or length(mime_type) <= 255)
  not valid;

alter table public.files_meta
  drop constraint if exists files_meta_folder_length_check;

alter table public.files_meta
  add constraint files_meta_folder_length_check
  check (length(folder) between 1 and 1024)
  not valid;

comment on constraint files_meta_mime_type_length_check on public.files_meta is
  'Bounds client-provided MIME metadata before it is persisted or propagated through NUBYX Continuity.';

comment on constraint files_meta_folder_length_check on public.files_meta is
  'Bounds client-provided Drive folder metadata before it is persisted or propagated through NUBYX Continuity.';
