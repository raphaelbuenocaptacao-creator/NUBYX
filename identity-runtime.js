(() => {
  const config = window.NUBYX_CONFIG || {};
  const identityLayer = config.identityLayer === 'aureon' ? 'aureon' : 'standalone';
  const authProvider = config.authProvider === 'supabase' ? 'supabase' : 'unsupported';

  function isSecureHttpEndpoint(value) {
    if (typeof value !== 'string' || !value.trim()) return false;
    try {
      const url = new URL(value.trim());
      return url.protocol === 'https:' && !url.username && !url.password;
    } catch {
      return false;
    }
  }

  function isSafeProjectId(value) {
    return typeof value === 'string' && /^[a-z0-9][a-z0-9_-]{1,63}$/i.test(value.trim());
  }

  const validSupabaseUrl = isSecureHttpEndpoint(config.supabaseUrl);
  const validAureonBaseUrl = isSecureHttpEndpoint(config.aureonBaseUrl);
  const validProjectId = isSafeProjectId(config.aureonProjectId || 'nubyx');
  const hasSupabase = Boolean(validSupabaseUrl && typeof config.supabaseAnonKey === 'string' && config.supabaseAnonKey.trim());
  const hasAureonBase = Boolean(validAureonBaseUrl && validProjectId);
  const requiresAureon = identityLayer === 'aureon';
  const authReady = Boolean(config.authEnabled && authProvider === 'supabase' && hasSupabase);
  const ready = requiresAureon ? Boolean(authReady && hasAureonBase) : authReady;

  const state = Object.freeze({
    identityLayer,
    authProvider,
    aureonProjectId: validProjectId ? (config.aureonProjectId || 'nubyx').trim() : 'nubyx',
    aureonBaseUrlConfigured: validAureonBaseUrl,
    authConfigured: authReady,
    aureonReady: requiresAureon ? hasAureonBase : null,
    configurationValid: Boolean(validProjectId && (identityLayer !== 'aureon' || validAureonBaseUrl) && (!config.authEnabled || validSupabaseUrl)),
    ready,
    mode: ready ? 'cloud' : 'demo-safe'
  });

  window.NUBYX_IDENTITY = state;
  window.dispatchEvent(new CustomEvent('nubyx:identity-ready', { detail: state }));

  window.addEventListener('DOMContentLoaded', () => {
    const status = document.querySelector('#authStatus');
    if (!status || identityLayer !== 'aureon') return;

    if (ready) {
      status.textContent = 'NUBYX ID conectado à camada AUREON com autenticação em nuvem.';
      return;
    }

    if (!state.configurationValid) {
      status.textContent = 'Configuração do NUBYX ID inválida ou insegura. Endpoints cloud devem usar HTTPS e identificadores válidos; login real permanece bloqueado.';
      return;
    }

    if (!hasAureonBase && authReady) {
      status.textContent = 'Autenticação em nuvem configurada, mas o endpoint HTTPS do AUREON Base ainda não foi definido. Login AUREON permanece bloqueado por segurança.';
      return;
    }

    status.textContent = 'AUREON Base preparado, mas ainda sem infraestrutura pública completa de autenticação. Login real permanece bloqueado; demonstração disponível.';
  }, { once: true });
})();
