// Public runtime configuration for NUBYX.
// This file may contain only browser-safe public configuration.
// Never place service_role keys, database passwords or other secrets here.
window.NUBYX_CONFIG = Object.freeze({
  identityLayer: 'aureon',
  authProvider: 'supabase',
  aureonBaseUrl: '',
  aureonProjectId: 'nubyx',
  supabaseUrl: '',
  supabaseAnonKey: '',
  authEnabled: false
});
