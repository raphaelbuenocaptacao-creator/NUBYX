(() => {
  if (typeof installApp !== 'function' || typeof uninstallApp !== 'function') return;

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

  async function guardedInstallApp(app) {
    const session = captureSession();
    if (!session || !app) return;

    if (session.mode === 'supabase' && typeof supabaseClient !== 'undefined' && supabaseClient) {
      if (!session.userId) return;

      const { data: installed, error: listError } = await supabaseClient
        .from('user_apps')
        .select('app_key')
        .eq('user_id', session.userId);

      if (listError) {
        console.error(listError);
        if (isSameSession(session) && typeof showToast === 'function') showToast('Não foi possível verificar seus apps.');
        return;
      }

      if (!isSameSession(session)) return;
      if ((installed || []).some(item => item.app_key === app.key)) {
        if (typeof showToast === 'function') showToast(`${app.name} já está instalado.`);
        return;
      }

      const { error } = await supabaseClient.from('user_apps').insert({
        user_id: session.userId,
        app_key: app.key,
        app_name: app.name,
        app_url: app.url,
        icon: app.icon,
        position: (installed || []).length
      });

      if (error) {
        console.error(error);
        if (isSameSession(session) && typeof showToast === 'function') showToast('Falha ao instalar app.');
        return;
      }

      if (!isSameSession(session)) return;
      if (typeof publishStoreSync === 'function') await publishStoreSync(app, 'upsert');
    } else {
      if (!isSameSession(session)) return;
      const installed = typeof getDemoApps === 'function' ? getDemoApps() : [];
      if (installed.some(item => item.app_key === app.key)) {
        if (typeof showToast === 'function') showToast(`${app.name} já está instalado.`);
        return;
      }
      installed.push({ app_key: app.key, app_name: app.name, app_url: app.url, icon: app.icon, position: installed.length });
      if (typeof setDemoApps === 'function') setDemoApps(installed);
    }

    if (!isSameSession(session)) return;
    if (typeof showToast === 'function') showToast(`${app.name} instalado no NUBYX`);
    if (typeof renderStore === 'function') renderStore();
    if (typeof refreshInstalledCount === 'function') refreshInstalledCount();
  }

  async function guardedUninstallApp(appKey) {
    const session = captureSession();
    if (!session || !appKey) return;
    const app = typeof STORE_CATALOG !== 'undefined'
      ? STORE_CATALOG.find(item => item.key === appKey) || { key: appKey }
      : { key: appKey };

    if (session.mode === 'supabase' && typeof supabaseClient !== 'undefined' && supabaseClient) {
      if (!session.userId || !isSameSession(session)) return;

      const { error } = await supabaseClient
        .from('user_apps')
        .delete()
        .eq('user_id', session.userId)
        .eq('app_key', appKey);

      if (error) {
        console.error(error);
        if (isSameSession(session) && typeof showToast === 'function') showToast('Falha ao remover app.');
        return;
      }

      if (!isSameSession(session)) return;
      if (typeof publishStoreSync === 'function') await publishStoreSync(app, 'delete');
    } else {
      if (!isSameSession(session)) return;
      if (typeof getDemoApps === 'function' && typeof setDemoApps === 'function') {
        setDemoApps(getDemoApps().filter(item => item.app_key !== appKey));
      }
    }

    if (!isSameSession(session)) return;
    if (typeof showToast === 'function') showToast('App removido do NUBYX');
    if (typeof renderStore === 'function') renderStore();
    if (typeof refreshInstalledCount === 'function') refreshInstalledCount();
  }

  installApp = guardedInstallApp;
  uninstallApp = guardedUninstallApp;
  window.NUBYX_STORE_SESSION_GUARD = { captureSession, isSameSession };
})();
