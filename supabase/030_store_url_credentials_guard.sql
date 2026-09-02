-- NUBYX Store launch URL credential guard
-- Defense-in-depth for the Home/launcher boundary.
--
-- launcher.js already parses app URLs with the browser URL parser and rejects
-- destinations containing username/password credentials. This constraint moves
-- the same invariant closer to persisted data so direct API clients cannot save
-- URLs such as https://user:pass@example.com/app for later launcher consumption.
--
-- The authority component ends at '/', '?' or '#'. Any '@' before that boundary
-- represents userinfo in an HTTPS URL and is therefore rejected.
--
-- NOT VALID preserves compatibility with historical rows while enforcing the
-- rule immediately for new/updated records. Existing rows can be audited before
-- validating the constraint during a controlled database maintenance step.

alter table public.user_apps
  drop constraint if exists user_apps_app_url_no_credentials_chk,
  add constraint user_apps_app_url_no_credentials_chk
    check (
      app_url is null
      or app_url !~ '^https://[^/?#[:space:]]*@'
    ) not valid;

comment on constraint user_apps_app_url_no_credentials_chk on public.user_apps is
  'Rejects persisted NUBYX Store HTTPS launch URLs containing userinfo credentials before the authority boundary; launcher.js independently enforces the same rule at runtime.';
