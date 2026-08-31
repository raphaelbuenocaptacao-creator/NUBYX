(() => {
  const CHANNEL_NAME = 'nubyx-session';
  const STORAGE_KEY = 'nubyx_session_signal';
  const tabId = crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
  const channel = 'BroadcastChannel' in window ? new BroadcastChannel(CHANNEL_NAME) : null;
  let applyingRemoteSignal = false;

  function emitRemoteSessionEnd(message) {
    if (!message || message.type !== 'session-ended' || message.tabId === tabId) return;
    if (applyingRemoteSignal) return;

    applyingRemoteSignal = true;
    try {
      window.dispatchEvent(new CustomEvent('nubyx:session-ended', {
        detail: {
          userId: message.userId || null,
          mode: message.mode || 'unknown',
          reason: 'remote_logout',
          remote: true
        }
      }));

      try {
        localStorage.removeItem('nubyx_demo_session');
      } catch (_) {}

      const os = document.querySelector('#os');
      const auth = document.querySelector('#auth');
      if (os) os.classList.add('hidden');
      if (auth) auth.classList.remove('hidden');

      if (typeof currentProfile !== 'undefined') currentProfile = null;
      document.querySelector('#panel')?.replaceChildren();
      document.querySelectorAll('[data-user-scoped], [data-drive-open], [data-drive-delete], [data-store-key]').forEach(node => node.remove());
    } finally {
      applyingRemoteSignal = false;
    }
  }

  function broadcastSessionEnd(detail = {}) {
    if (detail.remote || applyingRemoteSignal) return;
    const message = {
      type: 'session-ended',
      tabId,
      userId: detail.userId || null,
      mode: detail.mode || 'unknown',
      reason: detail.reason || 'session_end',
      ts: Date.now()
    };

    try { channel?.postMessage(message); } catch (_) {}
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(message));
      localStorage.removeItem(STORAGE_KEY);
    } catch (_) {}
  }

  channel?.addEventListener('message', event => emitRemoteSessionEnd(event.data));
  window.addEventListener('storage', event => {
    if (event.key !== STORAGE_KEY || !event.newValue) return;
    try { emitRemoteSessionEnd(JSON.parse(event.newValue)); } catch (_) {}
  });
  window.addEventListener('nubyx:session-ended', event => broadcastSessionEnd(event.detail || {}));
  window.addEventListener('pagehide', () => channel?.close(), { once: true });
})();
