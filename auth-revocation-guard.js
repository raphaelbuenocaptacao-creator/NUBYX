(() => {
  let attempts = 0;
  let unsubscribe = null;
  const MAX_ATTEMPTS = 40;

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

  window.addEventListener('pagehide', () => {
    try { unsubscribe?.(); } catch {}
  }, { once: true });

  attachGuard();
})();
