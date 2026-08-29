-- NUBYX multi-user integrity hardening
-- Apply after schema.sql. Review in staging before production.
--
-- RLS remains the primary authorization boundary. These constraints add
-- defense-in-depth so user-owned metadata cannot point outside its owner
-- namespace even if a future client or API call is malformed.

-- A Drive metadata row must always point into the owning user's private
-- Storage prefix: <user_id>/...
-- NOT VALID avoids blocking deployment because of historical rows while
-- still enforcing the rule for all new/updated rows.
alter table public.files_meta
  drop constraint if exists files_meta_owner_storage_path_check;

alter table public.files_meta
  add constraint files_meta_owner_storage_path_check
  check (
    storage_path like user_id::text || '/%'
    and position('..' in storage_path) = 0
  ) not valid;

-- Store entries are web/PWA shortcuts. Reject executable and non-web URL
-- schemes at the database boundary. Cloud Android is separate infrastructure
-- and is intentionally not represented by APK URLs here.
alter table public.user_apps
  drop constraint if exists user_apps_https_url_check;

alter table public.user_apps
  add constraint user_apps_https_url_check
  check (
    app_url is null
    or app_url ~ '^https://[^[:space:]]+$'
  ) not valid;

-- Keep app identifiers predictable for indexing, sync keys and launcher use.
alter table public.user_apps
  drop constraint if exists user_apps_key_format_check;

alter table public.user_apps
  add constraint user_apps_key_format_check
  check (app_key ~ '^[a-z0-9][a-z0-9._-]{0,79}$') not valid;

comment on constraint files_meta_owner_storage_path_check on public.files_meta is
  'Defense-in-depth: Drive metadata must remain inside the owning user Storage prefix.';

comment on constraint user_apps_https_url_check on public.user_apps is
  'NUBYX Store accepts only HTTPS web/PWA destinations; Cloud Android is separate infrastructure.';

comment on constraint user_apps_key_format_check on public.user_apps is
  'Stable Store/sync key format for safe launcher and Continuity identifiers.';
