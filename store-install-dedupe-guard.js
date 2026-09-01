(() => {
  if (typeof installApp !== 'function') return;

  const inflight = new Map();

  function sessionKey() {
    const guard = window.NUBYX_STORE_SESSION_GUARD;
    const session = guard?.captureSession?.();
    if (!session) return 'anonymous';
    return [session.mode || 'unknown', session.userId || '', session.email || ''].join(':');
  }

  function appKey(app) {
    return typeof app?.key === 'string' ? app.key.trim().toLowerCase() : 'invalid';
  }

  const previousInstallApp = installApp;
  installApp = function installAppOnce(app) {
    const key = `${sessionKey()}::${appKey(app)}`;
    const active = inflight.get(key);
    if (active) {
      if (typeof showToast === 'function') showToast('Instalação já em andamento.');
      return active;
    }

    const task = Promise.resolve()
      .then(() => previousInstallApp(app))
      .finally(() => {
        if (inflight.get(key) === task) inflight.delete(key);
      });

    inflight.set(key, task);
    return task;
  };

  window.NUBYX_STORE_INSTALL_DEDUPE_GUARD = Object.freeze({
    pendingCount: () => inflight.size
  });
})();
