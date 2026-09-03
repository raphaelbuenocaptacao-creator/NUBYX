-- NUBYX Drive: enforce the upload limit at the Storage bucket boundary.
-- Apply after supabase/schema.sql.
--
-- The web client and files_meta already enforce a 25 MB limit, but authenticated
-- clients can call Supabase Storage directly. Keeping the same limit on the
-- private bucket prevents oversized objects from bypassing client/metadata
-- validation and protects storage cost and multi-user capacity planning.

update storage.buckets
set file_size_limit = 26214400 -- 25 MiB
where id = 'nubyx-user-files'
  and file_size_limit is distinct from 26214400;

comment on column storage.buckets.file_size_limit is
  'Maximum object size accepted by Supabase Storage for a bucket, in bytes.';
