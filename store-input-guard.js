(() => {
  if (typeof installApp !== 'function') return;

  const APP_KEY_RE = /^[a-z0-9][a-z0-9._-]{0,79}$/;
  const MAX_NAME_LENGTH = 80;
  const MAX_URL_LENGTH = 2048;
  const MAX_ICON_LENGTH = 8;

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

  const previousInstallApp = installApp;
  installApp = async function installValidatedStoreApp(app) {
    const safeApp = normalizeStoreApp(app);
    if (!safeApp) {
      if (typeof showToast === 'function') showToast('Este app não passou pela validação de segurança da Store.');
      return;
    }
    return previousInstallApp(safeApp);
  };

  window.NUBYX_STORE_INPUT_GUARD = Object.freeze({
    normalizeStoreApp,
    normalizeHttpsUrl
  });
})();
