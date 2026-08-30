(() => {
  const logout = document.querySelector('#logoutBtn');
  if (!logout) return;

  logout.addEventListener('click', () => {
    const profile = typeof currentProfile !== 'undefined' ? currentProfile : null;
    window.dispatchEvent(new CustomEvent('nubyx:session-ended', {
      detail: {
        userId: profile?.userId || null,
        mode: profile?.mode || 'unknown',
        reason: 'logout'
      }
    }));

    const panel = document.querySelector('#panel');
    if (panel) panel.replaceChildren();

    document.querySelectorAll('[data-user-scoped], [data-drive-open], [data-drive-delete], [data-store-key]').forEach((node) => node.remove());
  }, { capture: true });
})();
