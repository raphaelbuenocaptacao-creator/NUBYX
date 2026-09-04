-- NUBYX Store launcher ordering hardening
-- Keeps persisted launcher positions within a predictable range so malformed
-- clients cannot create extreme ordering values that degrade sorting/UX.
--
-- NOT VALID avoids blocking deployment on historical rows while enforcing the
-- rule immediately for all new or updated rows. Validate separately after
-- auditing existing data.

alter table public.user_apps
  drop constraint if exists user_apps_position_range_chk;

alter table public.user_apps
  add constraint user_apps_position_range_chk
  check (position is null or position between 0 and 9999) not valid;

comment on constraint user_apps_position_range_chk on public.user_apps is
  'Bounds per-user launcher ordering to a practical non-negative range for predictable Store and Home sorting.';
