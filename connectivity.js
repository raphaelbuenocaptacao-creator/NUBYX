(() => {
  let initialized = false;
  let lastOnline = navigator.onLine;

  function applyNetworkState(online, { announce = true } = {}) {
    const workspaceStatus = document.querySelector('#workspaceStatus');
    const cloudStatus = document.querySelector('#cloudStatus');
    const dots = document.querySelectorAll('.cloud-dot');

    document.documentElement.dataset.network = online ? 'online' : 'offline';

    if (workspaceStatus) {
      workspaceStatus.textContent = online
        ? 'Online · PWA Cloud Workspace'
        : 'Offline · modo local disponível';
      workspaceStatus.setAttribute('aria-live', 'polite');
    }

    if (cloudStatus) {
      cloudStatus.textContent = online ? 'Cloud connected' : 'Offline mode';
      cloudStatus.setAttribute('aria-live', 'polite');
    }

    dots.forEach(dot => {
      dot.setAttribute('aria-label', online ? 'Conectado' : 'Sem conexão');
      dot.setAttribute('title', online ? 'Conectado' : 'Sem conexão');
    });

    if (announce && initialized && online !== lastOnline && typeof showToast === 'function') {
      showToast(online
        ? 'Conexão restaurada. O NUBYX voltou ao modo online.'
        : 'Sem internet. O NUBYX continuará com recursos locais disponíveis.');
    }

    lastOnline = online;
    window.dispatchEvent(new CustomEvent('nubyx:network-change', {
      detail: Object.freeze({ online })
    }));
  }

  function refresh() {
    applyNetworkState(navigator.onLine);
  }

  window.addEventListener('online', refresh);
  window.addEventListener('offline', refresh);

  applyNetworkState(navigator.onLine, { announce: false });
  initialized = true;

  window.NUBYX_CONNECTIVITY = Object.freeze({
    isOnline: () => navigator.onLine,
    refresh
  });
})();
