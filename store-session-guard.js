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

  async function guardedListDriveFiles() {
    const session = captureSession();
    if (!session) return [];

    if (session.mode === 'supabase' && typeof supabaseClient !== 'undefined' && supabaseClient) {
      if (!session.userId) return [];
      const { data, error } = await supabaseClient
        .from('files_meta')
        .select('id,name,mime_type,size_bytes,storage_path,created_at')
        .eq('user_id', session.userId)
        .eq('folder', '/')
        .order('created_at', { ascending: false });
      if (error) {
        console.error(error);
        if (isSameSession(session) && typeof showToast === 'function') showToast('Falha ao carregar o Drive.');
        return [];
      }
      return isSameSession(session) ? (data || []) : [];
    }

    try {
      const files = typeof demoDriveAction === 'function' ? await demoDriveAction('list') : [];
      if (!isSameSession(session)) return [];
      return (files || []).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    } catch (error) {
      console.error(error);
      return [];
    }
  }

  async function guardedDownloadDriveFile(id) {
    const session = captureSession();
    if (!session || !id) return;
    const files = await guardedListDriveFiles();
    if (!isSameSession(session)) return;
    const file = files.find(item => item.id === id);
    if (!file) return typeof showToast === 'function' && showToast('Arquivo não encontrado.');

    if (session.mode === 'supabase' && typeof supabaseClient !== 'undefined' && supabaseClient) {
      const { data, error } = await supabaseClient.storage.from(DRIVE_BUCKET).createSignedUrl(file.storage_path, 60);
      if (!isSameSession(session)) return;
      if (error || !data?.signedUrl) {
        console.error(error);
        return typeof showToast === 'function' && showToast('Não foi possível abrir o arquivo.');
      }
      window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    const local = typeof demoDriveAction === 'function' ? await demoDriveAction('get', id) : null;
    if (!isSameSession(session)) return;
    if (!local?.blob) return typeof showToast === 'function' && showToast('Arquivo local indisponível.');
    const url = URL.createObjectURL(local.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = local.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function guardedDeleteDriveFile(id) {
    const session = captureSession();
    if (!session || !id) return;
    const files = await guardedListDriveFiles();
    if (!isSameSession(session)) return;
    const file = files.find(item => item.id === id);
    if (!file) return;

    if (session.mode === 'supabase' && typeof supabaseClient !== 'undefined' && supabaseClient) {
      const { error: storageError } = await supabaseClient.storage.from(DRIVE_BUCKET).remove([file.storage_path]);
      if (storageError) {
        console.error(storageError);
        if (isSameSession(session) && typeof showToast === 'function') showToast('Falha ao remover arquivo do Storage.');
        return;
      }
      if (!isSameSession(session)) return;
      const { error: metaError } = await supabaseClient
        .from('files_meta')
        .delete()
        .eq('user_id', session.userId)
        .eq('id', id);
      if (metaError) {
        console.error(metaError);
        if (isSameSession(session) && typeof showToast === 'function') showToast('Arquivo removido, mas metadados precisam de reconciliação.');
        return;
      }
    } else {
      if (!isSameSession(session)) return;
      if (typeof demoDriveAction === 'function') await demoDriveAction('delete', id);
    }

    if (!isSameSession(session)) return;
    if (typeof showToast === 'function') showToast('Arquivo removido do NUBYX Drive');
    if (typeof renderDrive === 'function') renderDrive();
  }

  async function guardedUploadDriveFiles(fileList) {
    const session = captureSession();
    if (!session || !fileList?.length) return;
    const files = [...fileList];

    for (const file of files) {
      if (!isSameSession(session)) return;
      if (file.size > DRIVE_MAX_FILE_BYTES) {
        if (typeof showToast === 'function') showToast(`${file.name}: limite de 25 MB.`);
        continue;
      }

      const id = crypto.randomUUID();
      if (session.mode === 'supabase' && typeof supabaseClient !== 'undefined' && supabaseClient) {
        const path = `${session.userId}/${id}-${safeStorageName(file.name)}`;
        const { error: uploadError } = await supabaseClient.storage.from(DRIVE_BUCKET).upload(path, file, {
          upsert: false,
          contentType: file.type || 'application/octet-stream'
        });
        if (uploadError) {
          console.error(uploadError);
          if (isSameSession(session) && typeof showToast === 'function') showToast(`Falha ao enviar ${file.name}.`);
          continue;
        }

        if (!isSameSession(session)) {
          await supabaseClient.storage.from(DRIVE_BUCKET).remove([path]);
          return;
        }

        const { error: metaError } = await supabaseClient.from('files_meta').insert({
          id,
          user_id: session.userId,
          storage_path: path,
          name: file.name,
          mime_type: file.type || null,
          size_bytes: file.size,
          folder: '/'
        });
        if (metaError) {
          console.error(metaError);
          await supabaseClient.storage.from(DRIVE_BUCKET).remove([path]);
          if (isSameSession(session) && typeof showToast === 'function') showToast(`Falha ao registrar ${file.name}; upload revertido.`);
          continue;
        }
      } else {
        if (!isSameSession(session)) return;
        try {
          await demoDriveAction('put', {
            id,
            name: file.name,
            mime_type: file.type || null,
            size_bytes: file.size,
            created_at: new Date().toISOString(),
            blob: file
          });
        } catch (error) {
          console.error(error);
          if (isSameSession(session) && typeof showToast === 'function') showToast(`Falha ao salvar ${file.name} localmente.`);
          continue;
        }
      }
    }

    if (!isSameSession(session)) return;
    if (typeof showToast === 'function') showToast('NUBYX Drive atualizado');
    if (typeof renderDrive === 'function') renderDrive();
  }

  installApp = guardedInstallApp;
  uninstallApp = guardedUninstallApp;
  if (typeof listDriveFiles === 'function') listDriveFiles = guardedListDriveFiles;
  if (typeof downloadDriveFile === 'function') downloadDriveFile = guardedDownloadDriveFile;
  if (typeof deleteDriveFile === 'function') deleteDriveFile = guardedDeleteDriveFile;
  if (typeof uploadDriveFiles === 'function') uploadDriveFiles = guardedUploadDriveFiles;

  window.NUBYX_STORE_SESSION_GUARD = { captureSession, isSameSession };
  window.NUBYX_DRIVE_SESSION_GUARD = { captureSession, isSameSession };
})();
