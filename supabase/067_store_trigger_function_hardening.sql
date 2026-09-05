-- NUBYX Store trigger-function hardening
-- Reduce the callable surface of Store integrity helpers and keep their
-- execution context independent from caller-controlled search_path values.

alter function public.nubyx_guard_user_app_identity()
  set search_path = '';

alter function public.nubyx_set_user_app_installed_at()
  set search_path = '';

revoke execute on function public.nubyx_guard_user_app_identity() from public;
revoke execute on function public.nubyx_guard_user_app_identity() from anon;
revoke execute on function public.nubyx_guard_user_app_identity() from authenticated;

revoke execute on function public.nubyx_set_user_app_installed_at() from public;
revoke execute on function public.nubyx_set_user_app_installed_at() from anon;
revoke execute on function public.nubyx_set_user_app_installed_at() from authenticated;

comment on function public.nubyx_guard_user_app_identity() is
  'Preserves Store row identity/history; trigger-only helper with hardened search_path and no direct client execution.';

comment on function public.nubyx_set_user_app_installed_at() is
  'Assigns Store install timestamps on the server; trigger-only helper with no direct client execution.';
