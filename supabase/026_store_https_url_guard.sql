-- NUBYX Store launch URL safety
-- Defense-in-depth: persisted launcher destinations must use HTTPS.
-- The launcher still performs client-side URL parsing and rejects credentials;
-- this database constraint prevents direct API clients from persisting non-HTTPS
-- schemes such as javascript:, data:, http: or custom protocols.
--
-- NOT VALID keeps deployment compatible with historical rows while enforcing
-- the rule immediately for new/updated records. Existing rows can be audited
-- and the constraint validated in a separate maintenance step.

alter table public.user_apps
  drop constraint if exists user_apps_app_url_https_chk,
  add constraint user_apps_app_url_https_chk
    check (
      app_url is null
      or app_url ~ '^https://[^[:space:]]+$'
    ) not valid;

comment on constraint user_apps_app_url_https_chk on public.user_apps is
  'Restricts persisted NUBYX Store launch destinations to non-whitespace HTTPS URLs; launcher.js applies additional URL parsing and credential checks before opening.';
