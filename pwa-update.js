(() => {
  if (!('serviceWorker' in navigator)) return;

  const hadControllerAtBoot = Boolean(navigator.serviceWorker.controller);
  const OUTBOX_DB = 'nubyx-continuity';
  const OUTBOX_STORE = 'outbox';
  let reloading = false;
  let updatePrompt = null;

  function removePrompt() {
    if (!updatePrompt) return;
    updatePrompt.remove();
    updatePrompt = null;
  }

  function activeUserId() {
    try {
      return typeof currentProfile !== 'undefined' && currentProfile?.mode === 'supabase'
        ? currentProfile?.userId || null
        : null;
    } catch {
      return null;
    }
  }

  function isSameIdentity(expectedUserId) {
    return activeUserId() === expectedUserId;
  }

  function pendingOutboxCount(userId = activeUserId()) {
    if (!userId || !('indexedDB' in window)) return Promise.resolve(0);

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(OUTBOX_DB);
      request.onerror = () => reject(request.error || new Error('Unable to inspect NUBYX outbox'));
      request.onsuccess = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(OUTBOX_STORE)) {
          db.close();
          resolve(0);
          return;
        }
        const tx = db.transaction(OUTBOX_STORE, 'readonly');
        const store = tx.objectStore(OUTBOX_STORE);
        if (!store.indexNames.contains('user_created')) {
          db.close();
          resolve(0);
          return;
        }
        const range = IDBKeyRange.bound([userId, 0], [userId, Number.MAX_SAFE_INTEGER]);
        const count = store.index('user_created').count(range);
        count.onsuccess = () => resolve(count.result || 0);
        count.onerror = () => reject(count.error || new Error('Unable to count NUBYX outbox'));
        tx.oncomplete = () => db.close();
        tx.onerror = () => db.close();
        tx.onabort = () => db.close();
      };
    });
  }

  async function waitForOutbox(userId, timeoutMs = 8000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      if (!isSameIdentity(userId)) return false;
      if ((await pendingOutboxCount(userId)) === 0) return isSameIdentity(userId);
      await new Promise(resolve => setTimeout(resolve, 400));
    }
    if (!isSameIdentity(userId)) return false;
    return (await pendingOutboxCount(userId)) === 0 && isSameIdentity(userId);
  }

  function showUpdatePrompt(worker) {
    if (!worker || updatePrompt) return;

    const host = document.createElement('div');
    host.setAttribute('role', 'status');
    host.setAttribute('aria-live', 'polite');
    host.style.cssText = [
      'position:fixed',
      'left:50%',
      'bottom:max(18px, env(safe-area-inset-bottom))',
      'transform:translateX(-50%)',
      'z-index:2147483647',
      'width:min(92vw,460px)',
      'padding:14px',
      'border:1px solid rgba(255,255,255,.16)',
      'border-radius:18px',
      'background:rgba(10,14,24,.94)',
      'backdrop-filter:blur(18px)',
      'box-shadow:0 18px 60px rgba(0,0,0,.42)',
      'color:#fff',
      'font:500 14px/1.4 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif'
    ].join(';');

    const copy = document.createElement('div');
    const title = document.createElement('strong');
    title.style.cssText = 'display:block;font-size:15px;margin-bottom:3px';
    title.textContent = 'Nova versão do NUBYX pronta';
    const message = document.createElement('span');
    message.style.opacity = '.72';
    message.textContent = 'Atualize quando for seguro. O NUBYX confirma a sincronização antes de recarregar.';
    copy.append(title, message);

    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;margin-top:12px';

    const later = document.createElement('button');
    later.type = 'button';
    later.textContent = 'Depois';
    later.style.cssText = 'border:0;border-radius:12px;padding:9px 13px;background:rgba(255,255,255,.08);color:#fff;cursor:pointer';
    later.addEventListener('click', removePrompt);

    const update = document.createElement('button');
    update.type = 'button';
    update.textContent = 'Atualizar agora';
    update.style.cssText = 'border:0;border-radius:12px;padding:9px 13px;background:#fff;color:#070b12;font-weight:700;cursor:pointer';
    update.addEventListener('click', async () => {
      const updateUserId = activeUserId();
      update.disabled = true;
      later.disabled = true;
      update.textContent = 'Verificando…';

      const deferForIdentityChange = () => {
        message.textContent = 'A conta mudou durante a verificação. A atualização foi adiada para proteger os dados da sessão.';
        update.disabled = false;
        later.disabled = false;
        update.textContent = 'Tentar novamente';
        window.dispatchEvent(new CustomEvent('nubyx:pwa-update-deferred', { detail: { reason: 'session_changed' } }));
      };

      try {
        let pending = await pendingOutboxCount(updateUserId);
        if (!isSameIdentity(updateUserId)) {
          deferForIdentityChange();
          return;
        }

        if (pending > 0) {
          message.textContent = `${pending} alteração${pending === 1 ? '' : 'ões'} aguardando sincronização. Enviando antes de atualizar…`;
          update.textContent = 'Sincronizando…';
          window.dispatchEvent(new CustomEvent('nubyx:sync-flush-request'));

          const synced = await waitForOutbox(updateUserId);
          if (!isSameIdentity(updateUserId)) {
            deferForIdentityChange();
            return;
          }
          if (!synced) {
            pending = await pendingOutboxCount(updateUserId);
            if (!isSameIdentity(updateUserId)) {
              deferForIdentityChange();
              return;
            }
            message.textContent = `${pending} alteração${pending === 1 ? '' : 'ões'} ainda pendente${pending === 1 ? '' : 's'}. A atualização foi adiada para proteger seu trabalho.`;
            update.disabled = false;
            later.disabled = false;
            update.textContent = 'Tentar novamente';
            window.dispatchEvent(new CustomEvent('nubyx:pwa-update-deferred', { detail: { reason: 'sync_pending', pending } }));
            return;
          }
        }

        if (!isSameIdentity(updateUserId)) {
          deferForIdentityChange();
          return;
        }

        message.textContent = 'Sincronização confirmada. Aplicando a nova versão…';
        update.textContent = 'Atualizando…';
        worker.postMessage({ type: 'NUBYX_SKIP_WAITING' });
      } catch (error) {
        console.warn('NUBYX update safety check failed', error);
        message.textContent = 'Não foi possível confirmar a sincronização. A atualização foi adiada por segurança.';
        update.disabled = false;
        later.disabled = false;
        update.textContent = 'Tentar novamente';
        window.dispatchEvent(new CustomEvent('nubyx:pwa-update-deferred', { detail: { reason: 'sync_check_failed' } }));
      }
    });

    actions.append(later, update);
    host.append(copy, actions);
    document.body.appendChild(host);
    updatePrompt = host;

    window.dispatchEvent(new CustomEvent('nubyx:pwa-update-ready'));
  }

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadControllerAtBoot || reloading) return;
    reloading = true;
    window.location.reload();
  });

  navigator.serviceWorker.ready.then((registration) => {
    if (registration.waiting && navigator.serviceWorker.controller) {
      showUpdatePrompt(registration.waiting);
    }

    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) {
          showUpdatePrompt(worker);
        }
      });
    });
  }).catch(() => {});
})();
