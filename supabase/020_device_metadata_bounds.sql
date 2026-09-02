-- NUBYX Continuity: bound client-controlled device metadata
-- Apply after 002_device_sync.sql.
--
-- platform and user_agent are descriptive fields supplied by clients. Keep them
-- bounded so a valid authenticated user cannot create unexpectedly large device
-- registry rows or amplify storage/logging costs. NOT VALID avoids blocking the
-- migration on legacy rows while still enforcing the constraints for new writes.

alter table public.user_devices
  add constraint user_devices_platform_length_check
  check (platform is null or length(platform) <= 64)
  not valid;

alter table public.user_devices
  add constraint user_devices_user_agent_length_check
  check (user_agent is null or length(user_agent) <= 1024)
  not valid;

comment on constraint user_devices_platform_length_check on public.user_devices is
  'Bounds client-supplied platform metadata to 64 characters.';

comment on constraint user_devices_user_agent_length_check on public.user_devices is
  'Bounds client-supplied user-agent metadata to 1024 characters.';
