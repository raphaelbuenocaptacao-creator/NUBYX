-- NUBYX Drive storage path ownership guard
-- Prevents a files_meta row from referencing a Storage path outside its owner prefix.
-- Added as NOT VALID so legacy rows do not block deployment; PostgreSQL still
-- enforces the constraint for new or changed rows. Validate after auditing legacy data.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'files_meta_storage_path_owner_check'
      AND conrelid = 'public.files_meta'::regclass
  ) THEN
    ALTER TABLE public.files_meta
      ADD CONSTRAINT files_meta_storage_path_owner_check
      CHECK (
        storage_path LIKE user_id::text || '/%'
        AND storage_path NOT LIKE user_id::text || '//%'
      ) NOT VALID;
  END IF;
END
$$;

COMMENT ON CONSTRAINT files_meta_storage_path_owner_check ON public.files_meta IS
  'Requires Drive metadata storage_path to remain inside the owning user UUID prefix.';

-- Production follow-up after confirming there are no legacy violations:
-- ALTER TABLE public.files_meta VALIDATE CONSTRAINT files_meta_storage_path_owner_check;
