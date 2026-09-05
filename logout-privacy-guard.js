(() => {
  const logout = document.querySelector('#logoutBtn');
  if (!logout) return;

  function appScopeNamespace() {
    try {
      const baseUrl = new URL(document.baseURI);
      const normalizedPath = baseUrl.pathname.replace(/\/+$/, '') || '/';
      const scope = `${baseUrl.origin}${normalizedPath}`;
      let hash = 2166136261;
      for (let index = 0; index < scope.length; index += 1) {
        hash ^= scope.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
      }
      return (hash >>> 0).toString(36);
    } catch {
      return 'default';
    }
  }

  const APP_SCOPE = appScopeNamespace();
  const CHANNEL_NAME = `nubyx-session-${APP_SCOPE}`;
  const STORAGE_KEY = `nubyx_session_signal_${APP_SCOPE}`;
  const MAX_SIGNAL_AGE_MS = 15 * 1000;
  const MAX_CLOCK_SKEW_MS = 5 * 1000;
  const tabId = crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
  const channel = 'BroadcastChannel' in window ? new BroadcastChannel(CHANNEL_NAME) : null;
  let applyingRemoteSignal = false;

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

  function clearVisibleWorkspace() {
    const panel = document.querySelector('#panel');
    if (panel) panel.replaceChildren();
    document.querySelectorAll('[data-user-scoped], [data-drive-open], [data-drive-delete], [data-store-key]').forEach((node) => node.remove());
  }

  async function revokeLocalCloudSession(profile) {
    if (profile?.mode !== 'supabase') return;
    if (typeof supabaseClient === 'undefined' || !supabaseClient?.auth?.signOut) return;

    try {
      const { error } = await supabaseClient.auth.signOut({ scope: 'local' });
      if (error) console.warn('NUBYX: logout remoto não conseguiu revogar a sessão local.', error);
    } catch (error) {
      console.warn('NUBYX: falha ao revogar a sessão local após logout remoto.', error);
    }
  }

  function publishSessionEnd(detail) {
    if (detail?.remote || applyingRemoteSignal) return;
    const message = {
      type: 'session-ended',
      scope: APP_SCOPE,
      tabId,
      userId: detail?.userId || null,
      mode: detail?.mode || 'unknown',
      reason: detail?.reason || 'session_end',
      ts: Date.now()
    };
    try { channel?.postMessage(message); } catch (_) {}
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(message));
      localStorage.removeItem(STORAGE_KEY);
    } catch (_) {}
  }

  function isFreshSessionSignal(message) {
    const timestamp = Number(message?.ts);
    if (!Number.isFinite(timestamp) || timestamp <= 0) return false;
    const age = Date.now() - timestamp;
    return age >= -MAX_CLOCK_SKEW_MS && age <= MAX_SIGNAL_AGE_MS;
  }

  function isMatchingSession(message, profile) {
    if (!message || message.type !== 'session-ended' || message.scope !== APP_SCOPE || !isFreshSessionSignal(message)) return false;
    if (message.tabId === tabId || applyingRemoteSignal) return false;

    const currentUserId = profile?.userId || null;
    const currentMode = profile?.mode || 'unknown';
    const sourceUserId = message.userId || null;
    const sourceMode = message.mode || 'unknown';

    if (currentUserId && sourceUserId) return currentUserId === sourceUserId;
    if (currentUserId || sourceUserId) return false;
    return currentMode === sourceMode;
  }

  function applyRemoteSessionEnd(message) {
    const profile = typeof currentProfile !== 'undefined' ? currentProfile : null;
    if (!isMatchingSession(message, profile)) return;

    applyingRemoteSignal = true;
    try {
      window.dispatchEvent(new CustomEvent('nubyx:session-ended', {
        detail: {
          userId: message.userId || profile?.userId || null,
          mode: message.mode || profile?.mode || 'unknown',
          reason: 'remote_logout',
          remote: true
        }
      }));
      purgeDemoWorkspace(profile);
      clearVisibleWorkspace();
      if (typeof currentProfile !== 'undefined') currentProfile = null;
      document.querySelector('#os')?.classList.add('hidden');
      document.querySelector('#auth')?.classList.remove('hidden');
      void revokeLocalCloudSession(profile);
    } finally {
      applyingRemoteSignal = false;
    }
  }

  channel?.addEventListener('message', (event) => applyRemoteSessionEnd(event.data));
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY || !event.newValue) return;
    try { applyRemoteSessionEnd(JSON.parse(event.newValue)); } catch (_) {}
  });
  window.addEventListener('nubyx:session-ended', (event) => publishSessionEnd(event.detail || {}));
  window.addEventListener('pagehide', () => channel?.close(), { once: true });

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
    clearVisibleWorkspace();
  }, { capture: true });
})();