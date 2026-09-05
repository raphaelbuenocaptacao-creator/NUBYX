(() => {
  if (typeof listInstalledApps !== 'function') return;

  let storeRenderGeneration = 0;
  let installedCountGeneration = 0;

  function normalizedUserId(profile) {
    return typeof profile?.userId === 'string' && profile.userId.trim()
      ? profile.userId.trim()
      : null;
  }

  function captureSession() {
    if (typeof currentProfile === 'undefined' || !currentProfile) return null;
    const mode = currentProfile.mode || 'unknown';
    const userId = normalizedUserId(currentProfile);

    if (mode === 'supabase' && !userId) return null;

    return {
      profileRef: currentProfile,
      mode,
      userId,
      email: currentProfile.email || null
    };
  }

  function isSameSession(snapshot) {
    if (!snapshot || typeof currentProfile === 'undefined' || !currentProfile) return false;
    const mode = currentProfile.mode || 'unknown';
    const userId = normalizedUserId(currentProfile);
    if (mode === 'supabase' && !userId) return false;
    return currentProfile === snapshot.profileRef &&
      mode === snapshot.mode &&
      userId === snapshot.userId &&
      (currentProfile.email || null) === snapshot.email;
  }

  async function guardedListInstalledApps() {
    const session = captureSession();
    if (!session) return [];

    if (session.mode === 'supabase' && typeof supabaseClient !== 'undefined' && supabaseClient) {
      const { data, error } = await supabaseClient
        .from('user_apps')
        .select('app_key,app_name,app_url,icon,position')
        .eq('user_id', session.userId)
        .order('position', { ascending: true });

      if (error) {
        console.error(error);
        if (isSameSession(session) && typeof showToast === 'function') showToast('Não foi possível sincronizar seus apps.');
        return [];
      }
      return isSameSession(session) ? (data || []) : [];
    }

    const apps = typeof getDemoApps === 'function' ? getDemoApps() : [];
    return isSameSession(session) ? apps : [];
  }

  async function guardedRefreshInstalledCount() {
    const generation = ++installedCountGeneration;
    const session = captureSession();
    if (!session) return;
    const custom = await guardedListInstalledApps();
    if (generation !== installedCountGeneration || !isSameSession(session)) return;
    const target = document.querySelector('#installedCount');
    if (target) target.textContent = `${8 + custom.length} apps`;
  }

  async function guardedRenderStore() {
    const generation = ++storeRenderGeneration;
    const session = captureSession();
    if (!session) return;
    const installed = await guardedListInstalledApps();
    if (generation !== storeRenderGeneration || !isSameSession(session)) return;

    const panel = document.querySelector('#panel');
    if (!panel || typeof STORE_CATALOG === 'undefined') return;
    const installedKeys = new Set(installed.map(item => item.app_key));
    panel.innerHTML = `<div class="panel-title"><div><span class="eyebrow">NUBYX STORE</span><h3>Apps para seu ambiente</h3></div><span class="ghost">${installed.length} extras</span></div>
      <div class="store-grid">${STORE_CATALOG.map(app => {
        const has = installedKeys.has(app.key);
        return `<article class="store-card"><div class="store-icon">${app.icon}</div><div><b>${app.name}</b><small>${app.description}</small></div><button class="${has ? 'ghost' : 'primary store-action'}" data-store-key="${app.key}" data-store-action="${has ? 'remove' : 'install'}">${has ? 'Remover' : 'Instalar'}</button></article>`;
      }).join('')}</div>
      <p class="fine">A NUBYX Store instala atalhos e PWAs/serviços web compatíveis. Ela não executa APKs Android dentro do PWA.</p>`;

    panel.querySelectorAll('[data-store-key]').forEach(button => button.addEventListener('click', () => {
      if (generation !== storeRenderGeneration || !isSameSession(session)) return;
      const app = STORE_CATALOG.find(item => item.key === button.dataset.storeKey);
      if (!app) return;
      button.dataset.storeAction === 'remove' ? uninstallApp(app.key) : installApp(app);
    }));
  }

  listInstalledApps = guardedListInstalledApps;
  if (typeof refreshInstalledCount === 'function') refreshInstalledCount = guardedRefreshInstalledCount;
  if (typeof renderStore === 'function') renderStore = guardedRenderStore;

  window.NUBYX_STORE_READ_SESSION_GUARD = Object.freeze({ captureSession, isSameSession });
})();