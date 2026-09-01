-- NUBYX Store metadata bounds
-- Defense-in-depth for user_apps so direct API callers cannot bypass the
-- client-side Store guard and create oversized launcher/sync metadata.
--
-- NOT VALID keeps deployment safe with historical rows: PostgreSQL enforces
-- these checks immediately for all new/updated rows. Validate separately after
-- auditing existing data.

alter table public.user_apps
  drop constraint if exists user_apps_app_name_size_chk,
  add constraint user_apps_app_name_size_chk
    check (char_length(app_name) between 1 and 80) not valid;

alter table public.user_apps
  drop constraint if exists user_apps_app_url_size_chk,
  add constraint user_apps_app_url_size_chk
    check (app_url is null or char_length(app_url) between 1 and 2048) not valid;

alter table public.user_apps
  drop constraint if exists user_apps_icon_compact_chk,
  add constraint user_apps_icon_compact_chk
    check (icon is null or char_length(icon) <= 8) not valid;

-- Positions are user-local launcher ordering metadata. Bound the value to keep
-- malformed clients from creating extreme sparse ordering values at scale.
alter table public.user_apps
  drop constraint if exists user_apps_position_bound_chk,
  add constraint user_apps_position_bound_chk
    check (position between 0 and 10000) not valid;

comment on constraint user_apps_app_name_size_chk on public.user_apps is
  'Matches the NUBYX Store client limit and bounds launcher/sync app names to 80 characters.';

comment on constraint user_apps_app_url_size_chk on public.user_apps is
  'Caps Store HTTPS destination URLs at 2048 characters; URL scheme validation is enforced separately.';

comment on constraint user_apps_icon_compact_chk on public.user_apps is
  'Keeps Store icon metadata compact for launcher rendering and sync payloads.';

comment on constraint user_apps_position_bound_chk on public.user_apps is
  'Prevents pathological sparse launcher positions while preserving ample per-user ordering capacity.';
