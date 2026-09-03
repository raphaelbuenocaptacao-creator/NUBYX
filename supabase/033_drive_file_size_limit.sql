-- NUBYX Drive server-side file size guard
-- Keeps the database and Storage bucket aligned with the 25 MiB client limit.
-- Safe to re-run. Existing oversized metadata rows do not block deployment;
-- the NOT VALID constraint applies immediately to new/updated rows.

alter table public.files_meta
  drop constraint if exists files_meta_size_bytes_max_chk,
  add constraint files_meta_size_bytes_max_chk
    check (size_bytes between 0 and 26214400) not valid;

comment on constraint files_meta_size_bytes_max_chk on public.files_meta is
  'Caps NUBYX Drive metadata at 25 MiB per file, matching the product upload limit.';

-- Supabase Storage supports a per-bucket file_size_limit. Guard the update so
-- this migration remains compatible with older/self-hosted Storage schemas
-- where the column may not exist yet.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'storage'
      and table_name = 'buckets'
      and column_name = 'file_size_limit'
  ) then
    execute $sql$
      update storage.buckets
      set file_size_limit = 26214400
      where id = 'nubyx-user-files'
    $sql$;
  else
    raise notice 'storage.buckets.file_size_limit is unavailable; metadata limit applied, Storage bucket limit skipped.';
  end if;
end
$$;
