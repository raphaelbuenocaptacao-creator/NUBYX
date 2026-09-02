-- NUBYX Drive storage-path ownership guard
-- Apply after schema.sql and the preceding NUBYX migrations.
-- Safe to re-run.
--
-- files_meta is user-scoped by RLS, while Storage objects are scoped by the
-- first path segment (auth.uid()). Keep those two ownership boundaries aligned
-- so a modified client cannot persist metadata that points at another user's
-- Storage namespace.
--
-- NOT VALID avoids blocking deployment on historical rows while PostgreSQL
-- immediately enforces the rule for all new or updated rows. Validate the
-- constraint after auditing any legacy metadata paths.

alter table public.files_meta
  drop constraint if exists files_meta_storage_owner_prefix_chk,
  add constraint files_meta_storage_owner_prefix_chk
    check (
      left(storage_path, char_length(user_id::text) + 1)
      = user_id::text || '/'
    ) not valid;

comment on constraint files_meta_storage_owner_prefix_chk on public.files_meta is
  'Requires every Drive metadata path to stay inside the owning NUBYX ID Storage prefix.';
