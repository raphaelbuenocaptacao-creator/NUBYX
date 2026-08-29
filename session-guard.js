(() => {
  const WATCH_MS = 500;
  let subscribed = false;

  function lockCloudShell(reason = 'Sessão encerrada') {
    if (typeof currentProfile === 'undefined' || currentProfile?.mode !== 'supabase') return;

    currentProfile = null;
    localStorage.removeItem('nubyx_demo_session');

    const osShell = document.querySelector('#os');
    const authShell = document.querySelector('#auth');
    if (osShell) osShell.classList.add('hidden');
    if (authShell) authShell.classList.remove('hidden');

    const status = document.querySelector('#authStatus');
    if (status) status.textContent = 'Sua sessão NUBYX ID terminou. Entre novamente para acessar seus dados.';

    if (typeof showToast === 'function') showToast(reason);
  }

  function attachGuard() {
    if (subscribed || typeof supabaseClient === 'undefined' || !supabaseClient?.auth?.onAuthStateChange) return;
    subscribed = true;

    supabaseClient.auth.onAuthStateChange((event, session) => {
      if (session?.user) return;
      if (event === 'SIGNED_OUT' || currentProfile?.mode === 'supabase') {
        lockCloudShell(event === 'SIGNED_OUT' ? 'NUBYX ID desconectado' : 'Sessão NUBYX ID expirada');
      }
    });
  }

  const watcher = setInterval(() => {
    attachGuard();
    if (subscribed) clearInterval(watcher);
  }, WATCH_MS);

  attachGuard();
  window.NUBYX_SESSION_GUARD = { lock: lockCloudShell };
})();
