(() => {
  if (typeof installApp !== 'function' || typeof uninstallApp !== 'function') return;

  const APP_KEY_RE = /^[a-z0-9][a-z0-9._-]{0,79}$/;
  const MAX_NAME_LENGTH = 80;
  const MAX_URL_LENGTH = 2048;
  const MAX_ICON_LENGTH = 8;
  const inflightMutations = new Map();

  function normalizeAppKey(value) {
    if (typeof value !== 'string') return null;
    const key = value.trim().toLowerCase();
    return APP_KEY_RE.test(key) ? key : null;
  }

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

    const key = normalizeAppKey(app.key);
    const name = typeof app.name === 'string' ? app.name.trim().slice(0, MAX_NAME_LENGTH) : '';
    const url = normalizeHttpsUrl(app.url);
    const icon = String(app.icon || '◎').slice(0, MAX_ICON_LENGTH);

    if (!key || !name || !url) return null;
    return Object.freeze({ key, name, url, icon });
  }

  function currentSessionKey() {
    const guard = window.NUBYX_STORE_SESSION_GUARD;
    const session = guard?.captureSession?.();
    if (!session) return 'anonymous';
    return [session.mode || 'unknown', session.userId || '', session.email || ''].join(':');
  }

  function mutationKey(appKey) {
    return `${currentSessionKey()}::${appKey}`;
  }

  function runMutationOnce(key, taskFactory) {
    if (inflightMutations.has(key)) {
      if (typeof showToast === 'function') showToast('Alteração deste app já está em andamento.');
      return Promise.resolve();
    }

    const task = Promise.resolve()
      .then(taskFactory)
      .finally(() => {
        if (inflightMutations.get(key) === task) inflightMutations.delete(key);
      });

    inflightMutations.set(key, task);
    return task;
  }

  const previousInstallApp = installApp;
  const previousUninstallApp = uninstallApp;

  installApp = function installValidatedStoreApp(app) {
    const safeApp = normalizeStoreApp(app);
    if (!safeApp) {
      if (typeof showToast === 'function') showToast('Este app não passou pela validação de segurança da Store.');
      return Promise.resolve();
    }

    return runMutationOnce(mutationKey(safeApp.key), () => previousInstallApp(safeApp));
  };

  uninstallApp = function uninstallValidatedStoreApp(appKey) {
    const safeKey = normalizeAppKey(appKey);
    if (!safeKey) {
      if (typeof showToast === 'function') showToast('Identificador de app inválido.');
      return Promise.resolve();
    }

    return runMutationOnce(mutationKey(safeKey), () => previousUninstallApp(safeKey));
  };

  window.NUBYX_STORE_INPUT_GUARD = Object.freeze({
    normalizeStoreApp,
    normalizeAppKey,
    normalizeHttpsUrl,
    pendingMutationCount: () => inflightMutations.size,
    pendingInstallCount: () => inflightMutations.size
  });
})();
