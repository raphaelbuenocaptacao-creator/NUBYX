(() => {
  const WATCH_MS = 500;
  let subscribed = false;
  let surfacesWrapped = false;

  function sessionKey() {
    if (typeof currentProfile === 'undefined' || !currentProfile) return 'none';
    return `${currentProfile.mode || 'unknown'}:${currentProfile.userId || currentProfile.email || 'anonymous'}`;
  }

  function scrubPrivateWorkspace() {
    const panel = document.querySelector('#panel');
    if (panel) {
      panel.replaceChildren();
      panel.innerHTML = '<div class="panel-title"><div><span class="eyebrow">NUBYX ID</span><h3>Sessão protegida</h3><small>Entre novamente para carregar seu workspace.</small></div></div>';
    }

    const installedCount = document.querySelector('#installedCount');
    if (installedCount) installedCount.textContent = '—';

    document.querySelectorAll('[data-user-scoped], [data-drive-open], [data-drive-delete], [data-store-key]').forEach((node) => node.remove());
  }

  function wrapPrivateSurfaces() {
    if (surfacesWrapped) return;
    if (typeof renderDrive !== 'function' || typeof renderStore !== 'function') return;

    const originalRenderDrive = renderDrive;
    const originalRenderStore = renderStore;

    renderDrive = async function guardedRenderDrive(...args) {
      const startedFor = sessionKey();
      const result = await originalRenderDrive.apply(this, args);
      if (startedFor !== sessionKey()) scrubPrivateWorkspace();
      return result;
    };

    renderStore = async function guardedRenderStore(...args) {
      const startedFor = sessionKey();
      const result = await originalRenderStore.apply(this, args);
      if (startedFor !== sessionKey()) scrubPrivateWorkspace();
      return result;
    };

    surfacesWrapped = true;
  }

  function lockCloudShell(reason = 'Sessão encerrada') {
    if (typeof currentProfile === 'undefined' || currentProfile?.mode !== 'supabase') return;

    const endedUserId = currentProfile?.userId || null;
    window.dispatchEvent(new CustomEvent('nubyx:session-ended', {
      detail: { userId: endedUserId, reason }
    }));

    currentProfile = null;
    localStorage.removeItem('nubyx_demo_session');
    scrubPrivateWorkspace();

    const osShell = document.querySelector('#os');
    const authShell = document.querySelector('#auth');
    if (osShell) osShell.classList.add('hidden');
    if (authShell) authShell.classList.remove('hidden');

    const status = document.querySelector('#authStatus');
    if (status) status.textContent = 'Sua sessão NUBYX ID terminou. Entre novamente para acessar seus dados.';

    if (typeof showToast === 'function') showToast(reason);
  }

  function attachGuard() {
    wrapPrivateSurfaces();
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
    if (subscribed && surfacesWrapped) clearInterval(watcher);
  }, WATCH_MS);

  attachGuard();
  window.NUBYX_SESSION_GUARD = { lock: lockCloudShell, scrub: scrubPrivateWorkspace };
})();
