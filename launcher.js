(() => {
  function safeHttpsUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' ? url.href : null;
    } catch {
      return null;
    }
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

  async function refreshLauncher() {
    const grid = document.querySelector('#launcherGrid');
    if (!grid || typeof listInstalledApps !== 'function') return;

    grid.querySelectorAll('[data-installed-app]').forEach(node => node.remove());

    let installed = [];
    try {
      installed = await listInstalledApps();
    } catch (error) {
      console.warn('NUBYX launcher could not load installed apps.', error);
      syncLauncherCount(grid);
      return;
    }

    installed.forEach(app => {
      const url = safeHttpsUrl(app.app_url);
      if (!url) return;

      const button = document.createElement('button');
      button.className = 'installed-app';
      button.dataset.installedApp = app.app_key || 'web-app';
      button.type = 'button';
      button.setAttribute('aria-label', `Abrir ${app.app_name || 'aplicativo'}`);

      const icon = document.createElement('span');
      icon.textContent = String(app.icon || '◎').slice(0, 4);

      const label = document.createElement('small');
      label.textContent = String(app.app_name || 'App').slice(0, 40);

      button.append(icon, label);
      button.addEventListener('click', () => {
        const opened = window.open(url, '_blank', 'noopener,noreferrer');
        if (!opened && typeof showToast === 'function') {
          showToast('Permita pop-ups para abrir este app.');
        }
      });
      grid.appendChild(button);
    });

    syncLauncherCount(grid);
  }

  const previousRefreshInstalledCount = refreshInstalledCount;
  refreshInstalledCount = async function refreshInstalledCountWithLauncher() {
    await previousRefreshInstalledCount();
    await refreshLauncher();
  };

  window.addEventListener('nubyx:session-ended', clearSessionApps);

  window.NUBYX_LAUNCHER = Object.freeze({
    refresh: refreshLauncher,
    clearSessionApps
  });
})();