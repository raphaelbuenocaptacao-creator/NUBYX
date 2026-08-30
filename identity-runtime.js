(() => {
  const config = window.NUBYX_CONFIG || {};
  const identityLayer = config.identityLayer || 'standalone';
  const authProvider = config.authProvider || 'supabase';
  const hasSupabase = Boolean(config.supabaseUrl && config.supabaseAnonKey);
  const ready = Boolean(config.authEnabled && authProvider === 'supabase' && hasSupabase);

  const state = Object.freeze({
    identityLayer,
    authProvider,
    aureonProjectId: config.aureonProjectId || 'nubyx',
    aureonBaseUrlConfigured: Boolean(config.aureonBaseUrl),
    authConfigured: ready,
    mode: ready ? 'cloud' : 'demo-safe'
  });

  window.NUBYX_IDENTITY = state;

  window.addEventListener('DOMContentLoaded', () => {
    const status = document.querySelector('#authStatus');
    if (!status || identityLayer !== 'aureon') return;

    if (ready) {
      status.textContent = 'NUBYX ID conectado à camada AUREON com autenticação em nuvem.';
      return;
    }

    status.textContent = 'AUREON Base preparado, mas ainda sem credenciais públicas de autenticação. Login real permanece bloqueado; demonstração disponível.';
  }, { once: true });
})();
