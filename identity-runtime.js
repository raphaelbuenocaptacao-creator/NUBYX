(() => {
  const config = window.NUBYX_CONFIG || {};
  const identityLayer = config.identityLayer || 'standalone';
  const authProvider = config.authProvider || 'supabase';
  const hasSupabase = Boolean(config.supabaseUrl && config.supabaseAnonKey);
  const hasAureonBase = Boolean(config.aureonBaseUrl && config.aureonProjectId);
  const requiresAureon = identityLayer === 'aureon';
  const authReady = Boolean(config.authEnabled && authProvider === 'supabase' && hasSupabase);
  const ready = requiresAureon ? Boolean(authReady && hasAureonBase) : authReady;

  const state = Object.freeze({
    identityLayer,
    authProvider,
    aureonProjectId: config.aureonProjectId || 'nubyx',
    aureonBaseUrlConfigured: Boolean(config.aureonBaseUrl),
    authConfigured: authReady,
    aureonReady: requiresAureon ? hasAureonBase : null,
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

    if (!hasAureonBase && authReady) {
      status.textContent = 'Autenticação em nuvem configurada, mas o endpoint do AUREON Base ainda não foi definido. Login AUREON permanece bloqueado por segurança.';
      return;
    }

    status.textContent = 'AUREON Base preparado, mas ainda sem infraestrutura pública completa de autenticação. Login real permanece bloqueado; demonstração disponível.';
  }, { once: true });
})();
