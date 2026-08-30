(() => {
  const WATCH_MS = 500;
  const IDLE_CHECK_MS = 30 * 1000;
  const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
  const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'touchstart', 'scroll'];
  let subscribed = false;
  let surfacesWrapped = false;
  let lastActivityAt = Date.now();
  let idleLockInProgress = false;

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

  function showAuthShell(message) {
    const osShell = document.querySelector('#os');
    const authShell = document.querySelector('#auth');
    if (osShell) osShell.classList.add('hidden');
    if (authShell) authShell.classList.remove('hidden');

    const status = document.querySelector('#authStatus');
    if (status) status.textContent = message;
  }

  function dispatchSessionEnded(userId, reason) {
    window.dispatchEvent(new CustomEvent('nubyx:session-ended', {
      detail: { userId: userId || null, reason }
    }));
  }

  function lockCloudShell(reason = 'Sessão encerrada') {
    if (typeof currentProfile === 'undefined' || currentProfile?.mode !== 'supabase') return;

    const endedUserId = currentProfile?.userId || null;
    dispatchSessionEnded(endedUserId, reason);

    currentProfile = null;
    localStorage.removeItem('nubyx_demo_session');
    scrubPrivateWorkspace();
    showAuthShell('Sua sessão NUBYX ID terminou. Entre novamente para acessar seus dados.');

    if (typeof showToast === 'function') showToast(reason);
  }

  async function lockInactiveSession() {
    if (idleLockInProgress || typeof currentProfile === 'undefined' || !currentProfile) return;
    idleLockInProgress = true;

    const profile = currentProfile;
    const reason = 'NUBYX bloqueado por inatividade';

    if (profile.mode === 'supabase') {
      lockCloudShell(reason);
      try {
        if (typeof supabaseClient !== 'undefined' && supabaseClient?.auth?.signOut) {
          await supabaseClient.auth.signOut({ scope: 'local' });
        }
      } catch (error) {
        console.warn('NUBYX idle sign-out could not reach the auth provider.', error);
      }
    } else {
      dispatchSessionEnded(profile.userId || null, reason);
      localStorage.removeItem('nubyx_demo_session');
      currentProfile = null;
      scrubPrivateWorkspace();
      showAuthShell('Ambiente bloqueado após 30 minutos sem atividade. Entre novamente para continuar.');
      if (typeof showToast === 'function') showToast(reason);
    }

    idleLockInProgress = false;
  }

  function noteActivity() {
    if (typeof currentProfile !== 'undefined' && currentProfile) lastActivityAt = Date.now();
  }

  function checkIdleSession() {
    if (typeof currentProfile === 'undefined' || !currentProfile) {
      lastActivityAt = Date.now();
      return;
    }
    if (Date.now() - lastActivityAt >= IDLE_TIMEOUT_MS) lockInactiveSession();
  }

  function attachGuard() {
    wrapPrivateSurfaces();
    if (subscribed || typeof supabaseClient === 'undefined' || !supabaseClient?.auth?.onAuthStateChange) return;
    subscribed = true;

    supabaseClient.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        lastActivityAt = Date.now();
        return;
      }
      if (event === 'SIGNED_OUT' || currentProfile?.mode === 'supabase') {
        lockCloudShell(event === 'SIGNED_OUT' ? 'NUBYX ID desconectado' : 'Sessão NUBYX ID expirada');
      }
    });
  }

  ACTIVITY_EVENTS.forEach((eventName) => window.addEventListener(eventName, noteActivity, { passive: true }));
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) checkIdleSession();
  });
  setInterval(checkIdleSession, IDLE_CHECK_MS);

  const watcher = setInterval(() => {
    attachGuard();
    if (subscribed && surfacesWrapped) clearInterval(watcher);
  }, WATCH_MS);

  attachGuard();
  window.NUBYX_SESSION_GUARD = {
    lock: lockCloudShell,
    lockInactive: lockInactiveSession,
    scrub: scrubPrivateWorkspace,
    idleTimeoutMs: IDLE_TIMEOUT_MS
  };
})();
