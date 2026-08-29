-- NUBYX Continuity: bound user-controlled device metadata for safer scale
-- Apply after 002_device_sync.sql.
--
-- Device name, platform and user-agent values originate in browser clients.
-- Keeping them bounded prevents oversized rows/log amplification while preserving
-- enough room for normal device identification across web and future native clients.

alter table public.user_devices
  add constraint user_devices_device_name_size_chk
  check (octet_length(device_name) between 1 and 256)
  not valid;

alter table public.user_devices
  add constraint user_devices_platform_size_chk
  check (platform is null or octet_length(platform) <= 128)
  not valid;

alter table public.user_devices
  add constraint user_devices_user_agent_size_chk
  check (user_agent is null or octet_length(user_agent) <= 2048)
  not valid;

comment on constraint user_devices_device_name_size_chk on public.user_devices is
  'Bounds client-controlled device names to keep Continuity rows predictable.';

comment on constraint user_devices_platform_size_chk on public.user_devices is
  'Bounds client-controlled platform metadata for NUBYX Continuity.';

comment on constraint user_devices_user_agent_size_chk on public.user_devices is
  'Bounds client-controlled user-agent metadata to protect sync storage and logs.';
