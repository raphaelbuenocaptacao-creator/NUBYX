(() => {
  let attempts = 0;
  let unsubscribe = null;
  let resumeCheckInFlight = false;
  let lastResumeCheckAt = 0;
  const MAX_ATTEMPTS = 40;
  const RESUME_CHECK_MIN_INTERVAL_MS = 5000;

  function clearPrivateWorkspace(reason = 'auth_state_change') {
    if (typeof currentProfile === 'undefined' || currentProfile?.mode !== 'supabase') return;

    const profile = currentProfile;
    currentProfile = null;

    window.dispatchEvent(new CustomEvent('nubyx:session-ended', {
      detail: {
        userId: profile?.userId || null,
        mode: 'supabase',
        reason
      }
    }));

    const panel = document.querySelector('#panel');
    if (panel) panel.replaceChildren();

    document.querySelectorAll('[data-user-scoped], [data-drive-open], [data-drive-delete], [data-store-key]').forEach((node) => node.remove());

    document.querySelector('#os')?.classList.add('hidden');
    document.querySelector('#auth')?.classList.remove('hidden');

    const authStatus = document.querySelector('#authStatus');
    if (authStatus) authStatus.textContent = 'Sua sessão NUBYX ID terminou. Entre novamente para acessar seus dados.';

    if (typeof showToast === 'function') showToast('Sessão encerrada. Entre novamente no NUBYX ID.');
  }

  function authenticatedUserId(session) {
    const id = session?.user?.id;
    return typeof id === 'string' && id.trim() ? id.trim() : null;
  }

  function enforceSessionIdentity(event, session) {
    if (!session) {
      clearPrivateWorkspace(`auth_${String(event || 'signed_out').toLowerCase()}`);
      return;
    }

    if (typeof currentProfile === 'undefined' || currentProfile?.mode !== 'supabase') return;

    const activeUserId = typeof currentProfile?.userId === 'string' ? currentProfile.userId.trim() : '';
    const sessionUserId = authenticatedUserId(session);

    if (!activeUserId || !sessionUserId || activeUserId !== sessionUserId) {
      clearPrivateWorkspace('auth_identity_changed');
    }
  }

  async function revalidateResumedSession(reason = 'resume') {
    if (document.visibilityState === 'hidden' || resumeCheckInFlight) return;
    if (typeof currentProfile === 'undefined' || currentProfile?.mode !== 'supabase') return;
    if (typeof supabaseClient === 'undefined' || !supabaseClient?.auth?.getSession) return;

    const now = Date.now();
    if (now - lastResumeCheckAt < RESUME_CHECK_MIN_INTERVAL_MS) return;
    lastResumeCheckAt = now;
    resumeCheckInFlight = true;

    try {
      const { data, error } = await supabaseClient.auth.getSession();
      if (error) {
        console.warn('NUBYX: não foi possível revalidar a sessão ao retomar.', error);
        return;
      }
      enforceSessionIdentity(`resume_${reason}`, data?.session || null);
    } catch (error) {
      console.warn('NUBYX: falha não destrutiva ao revalidar sessão ao retomar.', error);
    } finally {
      resumeCheckInFlight = false;
    }
  }

  function attachGuard() {
    attempts += 1;

    try {
      if (typeof supabaseClient === 'undefined' || !supabaseClient?.auth?.onAuthStateChange) {
        if (attempts < MAX_ATTEMPTS) setTimeout(attachGuard, 250);
        return;
      }

      const { data } = supabaseClient.auth.onAuthStateChange((event, session) => {
        enforceSessionIdentity(event, session);
      });

      unsubscribe = data?.subscription?.unsubscribe?.bind(data.subscription) || null;
    } catch (error) {
      console.warn('NUBYX: não foi possível ativar a proteção contra sessão revogada.', error);
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void revalidateResumedSession('visible');
  });

  window.addEventListener('pageshow', () => {
    void revalidateResumedSession('pageshow');
  });

  window.addEventListener('pagehide', () => {
    try { unsubscribe?.(); } catch {}
  }, { once: true });

  attachGuard();
})();
