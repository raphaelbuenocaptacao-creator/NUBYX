(() => {
  const logout = document.querySelector('#logoutBtn');
  if (!logout) return;

  function purgeDemoWorkspace(profile) {
    if (profile?.mode !== 'demo') return;

    try {
      localStorage.removeItem('nubyx_demo_apps');
      localStorage.removeItem('nubyx_demo_session');
    } catch (error) {
      console.warn('NUBYX: não foi possível limpar o armazenamento local da sessão demo.', error);
    }

    if ('indexedDB' in window) {
      try {
        const request = indexedDB.deleteDatabase('nubyx-demo-drive');
        request.onerror = () => console.warn('NUBYX: não foi possível limpar o Drive demo local.', request.error);
        request.onblocked = () => console.warn('NUBYX: limpeza do Drive demo aguardando conexões locais fecharem.');
      } catch (error) {
        console.warn('NUBYX: falha ao solicitar limpeza do Drive demo.', error);
      }
    }
  }

  logout.addEventListener('click', () => {
    const profile = typeof currentProfile !== 'undefined' ? currentProfile : null;

    window.dispatchEvent(new CustomEvent('nubyx:session-ended', {
      detail: {
        userId: profile?.userId || null,
        mode: profile?.mode || 'unknown',
        reason: 'logout'
      }
    }));

    purgeDemoWorkspace(profile);

    const panel = document.querySelector('#panel');
    if (panel) panel.replaceChildren();

    document.querySelectorAll('[data-user-scoped], [data-drive-open], [data-drive-delete], [data-store-key]').forEach((node) => node.remove());
  }, { capture: true });
})();
