(() => {
  const MAX_APP_URL_LENGTH = 2048;
  const MAX_RENDERED_APPS = 200;
  let refreshGeneration = 0;

  function safeHttpsUrl(value) {
    if (typeof value !== 'string' || !value || value.length > MAX_APP_URL_LENGTH) return null;
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' || url.username || url.password) return null;
      return url.href;
    } catch {
      return null;
    }
  }

  function captureSession() {
    if (typeof currentProfile === 'undefined' || !currentProfile) return null;
    return {
      mode: currentProfile.mode || 'unknown',
      userId: currentProfile.userId || null,
      email: currentProfile.email || null
    };
  }

  function isSameSession(snapshot) {
    if (!snapshot || typeof currentProfile === 'undefined' || !currentProfile) return false;
    return (currentProfile.mode || 'unknown') === snapshot.mode &&
      (currentProfile.userId || null) === snapshot.userId &&
      (currentProfile.email || null) === snapshot.email;
  }

  function syncLauncherCount(grid) {
    if (!grid) return;
    const total = grid.querySelectorAll(':scope > button').length;
    const count = document.querySelector('#installedCount');
    if (count) count.textContent = `${total} app${total === 1 ? '' : 's'}`;

    const metric = document.querySelector('#appsMetric');
    if (metric) metric.textContent = String(total);
  }

  function clearSessionApps() {
    const grid = document.querySelector('#launcherGrid');
    if (!grid) return;
    grid.querySelectorAll('[data-installed-app]').forEach(node => node.remove());
    syncLauncherCount(grid);
  }

  function invalidateLauncher() {
    refreshGeneration += 1;
    clearSessionApps();
  }

  function launcherIdentity(app, safeUrl) {
    const appKey = typeof app?.app_key === 'string' ? app.app_key.trim().toLowerCase() : '';
    return appKey ? `key:${appKey}` : `url:${safeUrl}`;
  }

  function normalizeInstalledApps(value) {
    if (!Array.isArray(value)) {
      console.warn('NUBYX launcher ignored an invalid installed-app payload.');
      return [];
    }
    if (value.length > MAX_RENDERED_APPS) {
      console.warn(`NUBYX launcher limited rendering to ${MAX_RENDERED_APPS} apps.`);
    }
    return value.slice(0, MAX_RENDERED_APPS);
  }

  async function refreshLauncher() {
    const grid = document.querySelector('#launcherGrid');
    if (!grid || typeof listInstalledApps !== 'function') return;

    const generation = ++refreshGeneration;
    const session = captureSession();
    if (!session) {
      clearSessionApps();
      return;
    }

    grid.querySelectorAll('[data-installed-app]').forEach(node => node.remove());

    let installed = [];
    try {
      installed = normalizeInstalledApps(await listInstalledApps());
    } catch (error) {
      if (generation !== refreshGeneration) return;
      console.warn('NUBYX launcher could not load installed apps.', error);
      if (isSameSession(session)) syncLauncherCount(grid);
      return;
    }

    if (generation !== refreshGeneration) return;
    if (!isSameSession(session)) {
      invalidateLauncher();
      return;
    }

    const renderedApps = new Set();
    installed.forEach(app => {
      if (!app || typeof app !== 'object') return;
      const url = safeHttpsUrl(app.app_url);
      if (!url) return;

      const identity = launcherIdentity(app, url);
      if (renderedApps.has(identity)) return;
      renderedApps.add(identity);

      const button = document.createElement('button');
      button.className = 'installed-app';
      button.dataset.installedApp = typeof app.app_key === 'string' && app.app_key ? app.app_key.slice(0, 80) : 'web-app';
      button.type = 'button';
      button.setAttribute('aria-label', `Abrir ${String(app.app_name || 'aplicativo').slice(0, 80)}`);

      const icon = document.createElement('span');
      icon.textContent = String(app.icon || '◎').slice(0, 4);

      const label = document.createElement('small');
      label.textContent = String(app.app_name || 'App').slice(0, 40);

      button.append(icon, label);
      button.addEventListener('click', () => {
        if (!isSameSession(session)) {
          invalidateLauncher();
          if (typeof showToast === 'function') showToast('Sua sessão mudou. Atualize o launcher.');
          return;
        }
        const opened = window.open(url, '_blank', 'noopener,noreferrer');
        if (!opened && typeof showToast === 'function') {
          showToast('Permita pop-ups para abrir este app.');
        }
      });
      grid.appendChild(button);
    });

    if (generation === refreshGeneration && isSameSession(session)) syncLauncherCount(grid);
  }

  const previousRefreshInstalledCount = refreshInstalledCount;
  refreshInstalledCount = async function refreshInstalledCountWithLauncher() {
    await previousRefreshInstalledCount();
    await refreshLauncher();
  };

  window.addEventListener('nubyx:session-ended', invalidateLauncher);

  window.NUBYX_LAUNCHER = Object.freeze({
    refresh: refreshLauncher,
    clearSessionApps: invalidateLauncher,
    captureSession,
    isSameSession,
    maxRenderedApps: MAX_RENDERED_APPS
  });
})();