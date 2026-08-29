-- NUBYX Continuity: remove legacy cursor trigger after migration 010
-- Apply after 010_monotonic_sync_cursors.sql.
--
-- Migration 004 installed nubyx_sync_cursor_monotonic, which raises an
-- exception when a cursor moves backwards. Migration 010 replaced that
-- behavior with nubyx_sync_cursors_monotonic, which safely clamps stale or
-- out-of-order writes to the greatest checkpoint. Keeping both triggers can
-- cause the legacy trigger to reject a write before the newer trigger can
-- normalize it.

-- Remove only the obsolete trigger. The migration 010 trigger remains active.
drop trigger if exists nubyx_sync_cursor_monotonic on public.sync_cursors;

-- The legacy function is no longer referenced after the trigger is removed.
drop function if exists public.nubyx_enforce_monotonic_sync_cursor();

comment on function public.nubyx_keep_sync_cursor_monotonic() is
  'Keeps NUBYX Continuity checkpoints monotonic; migration 011 removes the legacy exception-based trigger so stale concurrent writes are clamped instead of failing.';
