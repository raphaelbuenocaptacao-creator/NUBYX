(() => {
  const CORE_APP_COUNT = 8;

  function safeHttpsUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' ? url.href : null;
    } catch {
      return null;
    }
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

    const count = document.querySelector('#installedCount');
    if (count) count.textContent = String(CORE_APP_COUNT + installed.length);
  }

  const previousRefreshInstalledCount = refreshInstalledCount;
  refreshInstalledCount = async function refreshInstalledCountWithLauncher() {
    await previousRefreshInstalledCount();
    await refreshLauncher();
  };

  window.NUBYX_LAUNCHER = Object.freeze({ refresh: refreshLauncher });
})();