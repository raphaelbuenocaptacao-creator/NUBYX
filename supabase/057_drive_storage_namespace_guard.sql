-- NUBYX Drive storage namespace guard
-- Keeps Drive metadata aligned with the private Storage bucket namespace.
-- Existing rows are preserved; the constraint applies to new/changed rows immediately.
-- Safe to re-run.

alter table public.files_meta
  drop constraint if exists files_meta_storage_namespace_guard;

alter table public.files_meta
  add constraint files_meta_storage_namespace_guard
  check (
    storage_path = btrim(storage_path)
    and split_part(storage_path, '/', 1) = user_id::text
    and array_position(string_to_array(storage_path, '/'), '') is null
    and array_position(string_to_array(storage_path, '/'), '.') is null
    and array_position(string_to_array(storage_path, '/'), '..') is null
    and position(E'\\' in storage_path) = 0
  ) not valid;

comment on constraint files_meta_storage_namespace_guard on public.files_meta is
  'Requires Drive metadata paths to stay inside the owning NUBYX ID namespace and rejects ambiguous traversal segments.';
