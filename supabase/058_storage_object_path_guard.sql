-- NUBYX Drive: harden private Storage object paths
-- Apply after supabase/schema.sql and 057_drive_storage_namespace_guard.sql.
--
-- Keeps the Storage bucket rules aligned with files_meta.storage_path:
-- every object must live under the authenticated NUBYX ID prefix and path
-- segments cannot be empty, dot, dot-dot, or contain backslashes.
-- Safe to re-run.

create or replace function public.nubyx_storage_path_is_safe(object_name text, owner_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog, public, storage
as $$
  select
    object_name = btrim(object_name)
    and split_part(object_name, '/', 1) = owner_id::text
    and array_position(string_to_array(object_name, '/'), '') is null
    and array_position(string_to_array(object_name, '/'), '.') is null
    and array_position(string_to_array(object_name, '/'), '..') is null
    and position(E'\\' in object_name) = 0;
$$;

revoke all on function public.nubyx_storage_path_is_safe(text, uuid) from public;
grant execute on function public.nubyx_storage_path_is_safe(text, uuid) to authenticated;

drop policy if exists "storage own folder select" on storage.objects;
drop policy if exists "storage own folder insert" on storage.objects;
drop policy if exists "storage own folder update" on storage.objects;
drop policy if exists "storage own folder delete" on storage.objects;

create policy "storage own folder select" on storage.objects
for select to authenticated
using (
  bucket_id = 'nubyx-user-files'
  and public.nubyx_storage_path_is_safe(name, (select auth.uid()))
);

create policy "storage own folder insert" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'nubyx-user-files'
  and public.nubyx_storage_path_is_safe(name, (select auth.uid()))
);

create policy "storage own folder update" on storage.objects
for update to authenticated
using (
  bucket_id = 'nubyx-user-files'
  and public.nubyx_storage_path_is_safe(name, (select auth.uid()))
)
with check (
  bucket_id = 'nubyx-user-files'
  and public.nubyx_storage_path_is_safe(name, (select auth.uid()))
);

create policy "storage own folder delete" on storage.objects
for delete to authenticated
using (
  bucket_id = 'nubyx-user-files'
  and public.nubyx_storage_path_is_safe(name, (select auth.uid()))
);

comment on function public.nubyx_storage_path_is_safe(text, uuid) is
  'Validates NUBYX Drive Storage object names against the authenticated per-user namespace and rejects ambiguous path segments.';
