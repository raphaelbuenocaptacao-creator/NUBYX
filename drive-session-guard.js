(() => {
  if (typeof listDriveFiles !== 'function') return;

  function captureDriveSession() {
    if (typeof currentProfile === 'undefined' || !currentProfile) return null;
    return {
      profileRef: currentProfile,
      mode: currentProfile.mode || 'unknown',
      userId: currentProfile.userId || null,
      email: currentProfile.email || null
    };
  }

  function isSameDriveSession(snapshot) {
    if (!snapshot || typeof currentProfile === 'undefined' || !currentProfile) return false;
    return currentProfile === snapshot.profileRef &&
      (currentProfile.mode || 'unknown') === snapshot.mode &&
      (currentProfile.userId || null) === snapshot.userId &&
      (currentProfile.email || null) === snapshot.email;
  }

  async function guardedListDriveFiles() {
    const session = captureDriveSession();
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
        if (isSameDriveSession(session) && typeof showToast === 'function') showToast('Falha ao carregar o Drive.');
        return [];
      }
      return isSameDriveSession(session) ? (data || []) : [];
    }

    try {
      const files = await demoDriveAction('list');
      if (!isSameDriveSession(session)) return [];
      return (files || []).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    } catch (error) {
      console.error(error);
      return [];
    }
  }

  async function guardedRenderDrive() {
    const session = captureDriveSession();
    if (!session) return;
    const panel = document.querySelector('#panel');
    if (!panel) return;

    panel.innerHTML = '<div class="panel-title"><div><span class="eyebrow">NUBYX DRIVE</span><h3>Carregando seu espaço privado...</h3></div></div>';
    const files = await guardedListDriveFiles();
    if (!isSameDriveSession(session)) return;

    const used = files.reduce((sum, file) => sum + Number(file.size_bytes || 0), 0);
    const mode = session.mode === 'supabase' ? 'Nuvem privada · RLS por usuário' : 'Demo local · IndexedDB neste dispositivo';
    panel.innerHTML = `<div class="panel-title"><div><span class="eyebrow">NUBYX DRIVE</span><h3>Seus arquivos</h3><small class="drive-mode">${mode}</small></div><label class="primary drive-upload">+ Upload<input id="driveFileInput" type="file" multiple hidden></label></div>
      <div class="drive-summary"><span>${files.length} arquivo${files.length === 1 ? '' : 's'}</span><span>${formatBytes(used)} usados</span><span>Limite por arquivo: 25 MB</span></div>
      <div class="drive-list">${files.length ? files.map(file => `<article class="drive-row"><div class="drive-file-icon">◫</div><div class="drive-file-meta"><b title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</b><small>${escapeHtml(file.mime_type || 'arquivo')} · ${formatBytes(file.size_bytes)}</small></div><button class="ghost" data-drive-open="${file.id}">Abrir</button><button class="ghost danger" data-drive-delete="${file.id}">Remover</button></article>`).join('') : '<div class="drive-empty"><span>◇</span><b>Seu Drive está vazio</b><small>Envie um arquivo para começar. No modo demo ele fica somente neste dispositivo.</small></div>'}</div>`;

    panel.querySelector('#driveFileInput')?.addEventListener('change', event => {
      if (isSameDriveSession(session)) uploadDriveFiles(event.target.files);
    });
    panel.querySelectorAll('[data-drive-open]').forEach(button => button.addEventListener('click', () => {
      if (isSameDriveSession(session)) downloadDriveFile(button.dataset.driveOpen);
    }));
    panel.querySelectorAll('[data-drive-delete]').forEach(button => button.addEventListener('click', () => {
      if (isSameDriveSession(session)) deleteDriveFile(button.dataset.driveDelete);
    }));
  }

  async function guardedDownloadDriveFile(id) {
    const session = captureDriveSession();
    if (!session) return;
    const files = await guardedListDriveFiles();
    if (!isSameDriveSession(session)) return;
    const file = files.find(item => item.id === id);
    if (!file) return showToast('Arquivo não encontrado.');

    if (session.mode === 'supabase' && typeof supabaseClient !== 'undefined' && supabaseClient) {
      const { data, error } = await supabaseClient.storage.from(DRIVE_BUCKET).createSignedUrl(file.storage_path, 60);
      if (!isSameDriveSession(session)) return;
      if (error || !data?.signedUrl) {
        console.error(error);
        return showToast('Não foi possível abrir o arquivo.');
      }
      window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    const local = await demoDriveAction('get', id);
    if (!isSameDriveSession(session) || !local?.blob) return;
    const url = URL.createObjectURL(local.blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = local.name;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function guardedDeleteDriveFile(id) {
    const session = captureDriveSession();
    if (!session) return;
    const files = await guardedListDriveFiles();
    if (!isSameDriveSession(session)) return;
    const file = files.find(item => item.id === id);
    if (!file) return;

    if (session.mode === 'supabase' && typeof supabaseClient !== 'undefined' && supabaseClient) {
      const { error: storageError } = await supabaseClient.storage.from(DRIVE_BUCKET).remove([file.storage_path]);
      if (storageError) {
        console.error(storageError);
        if (isSameDriveSession(session)) showToast('Falha ao remover arquivo do Storage.');
        return;
      }
      const { error: metaError } = await supabaseClient
        .from('files_meta')
        .delete()
        .eq('user_id', session.userId)
        .eq('id', id);
      if (metaError) {
        console.error(metaError);
        if (isSameDriveSession(session)) showToast('Arquivo removido, mas metadados precisam de reconciliação.');
        return;
      }
    } else {
      await demoDriveAction('delete', id);
    }

    if (!isSameDriveSession(session)) return;
    showToast('Arquivo removido do NUBYX Drive');
    guardedRenderDrive();
  }

  listDriveFiles = guardedListDriveFiles;
  if (typeof renderDrive === 'function') renderDrive = guardedRenderDrive;
  if (typeof downloadDriveFile === 'function') downloadDriveFile = guardedDownloadDriveFile;
  if (typeof deleteDriveFile === 'function') deleteDriveFile = guardedDeleteDriveFile;

  window.NUBYX_DRIVE_SESSION_GUARD = Object.freeze({ captureDriveSession, isSameDriveSession });
})();
