(() => {
  if (typeof installApp !== 'function') return;

  const APP_KEY_RE = /^[a-z0-9][a-z0-9._-]{0,79}$/;
  const MAX_NAME_LENGTH = 80;
  const MAX_URL_LENGTH = 2048;
  const MAX_ICON_LENGTH = 8;
  const inflightInstalls = new Map();

  function normalizeHttpsUrl(value) {
    if (typeof value !== 'string' || !value || value.length > MAX_URL_LENGTH) return null;
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' || url.username || url.password) return null;
      return url.href;
    } catch {
      return null;
    }
  }

  function normalizeStoreApp(app) {
    if (!app || typeof app !== 'object') return null;

    const key = typeof app.key === 'string' ? app.key.trim().toLowerCase() : '';
    const name = typeof app.name === 'string' ? app.name.trim().slice(0, MAX_NAME_LENGTH) : '';
    const url = normalizeHttpsUrl(app.url);
    const icon = String(app.icon || '◎').slice(0, MAX_ICON_LENGTH);

    if (!APP_KEY_RE.test(key) || !name || !url) return null;
    return Object.freeze({ key, name, url, icon });
  }

  function currentSessionKey() {
    const guard = window.NUBYX_STORE_SESSION_GUARD;
    const session = guard?.captureSession?.();
    if (!session) return 'anonymous';
    return [session.mode || 'unknown', session.userId || '', session.email || ''].join(':');
  }

  const previousInstallApp = installApp;
  installApp = function installValidatedStoreApp(app) {
    const safeApp = normalizeStoreApp(app);
    if (!safeApp) {
      if (typeof showToast === 'function') showToast('Este app não passou pela validação de segurança da Store.');
      return Promise.resolve();
    }

    const operationKey = `${currentSessionKey()}::${safeApp.key}`;
    const active = inflightInstalls.get(operationKey);
    if (active) {
      if (typeof showToast === 'function') showToast('Instalação já em andamento.');
      return active;
    }

    const task = Promise.resolve()
      .then(() => previousInstallApp(safeApp))
      .finally(() => {
        if (inflightInstalls.get(operationKey) === task) inflightInstalls.delete(operationKey);
      });

    inflightInstalls.set(operationKey, task);
    return task;
  };

  window.NUBYX_STORE_INPUT_GUARD = Object.freeze({
    normalizeStoreApp,
    normalizeHttpsUrl,
    pendingInstallCount: () => inflightInstalls.size
  });
})();
