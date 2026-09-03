-- NUBYX workspace snapshot timestamp integrity
-- Keeps workspace_state.updated_at authoritative on both INSERT and UPDATE.
-- This prevents a client from backdating/future-dating a newly created snapshot
-- and gives Continuity a trustworthy server-side ordering signal.
--
-- Safe to re-run. Review/apply in staging before production.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists workspace_state_set_updated_at on public.workspace_state;
create trigger workspace_state_set_updated_at
before insert or update on public.workspace_state
for each row execute function public.set_updated_at();

comment on trigger workspace_state_set_updated_at on public.workspace_state is
  'Forces workspace snapshot updated_at to database time on INSERT and UPDATE.';
