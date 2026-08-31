(() => {
  let refreshRunning = false;
  let pendingChannels = new Set();
  let pendingOutbox = 0;

  function activeSurface(){
    return document.querySelector('#panel .eyebrow')?.textContent?.trim() || '';
  }

  function setQueueUi(){
    const stateEl = document.querySelector('#syncState');
    const detailEl = document.querySelector('#syncDetail');
    if(!stateEl || !detailEl) return;

    if(pendingOutbox > 0){
      stateEl.textContent = navigator.onLine ? 'Sincronizando' : 'Offline';
      detailEl.textContent = pendingOutbox === 1
        ? '1 alteração aguardando envio'
        : `${pendingOutbox} alterações aguardando envio`;
      detailEl.setAttribute('aria-live', 'polite');
      return;
    }

    if(stateEl.textContent === 'Sincronizando' || (stateEl.textContent === 'Offline' && detailEl.textContent.includes('aguardando envio'))){
      stateEl.textContent = navigator.onLine ? 'Sincronizada' : 'Offline';
      detailEl.textContent = navigator.onLine ? 'continuidade em dia' : 'nenhuma alteração pendente';
    }
  }

  async function refreshChannel(channel){
    if(channel === 'apps'){
      if(typeof window.refreshInstalledCount === 'function') await window.refreshInstalledCount();
      if(activeSurface() === 'NUBYX STORE' && typeof window.renderStore === 'function'){
        await window.renderStore();
      }
      return;
    }

    if(channel === 'files' && activeSurface() === 'NUBYX DRIVE' && typeof window.renderDrive === 'function'){
      await window.renderDrive();
    }
  }

  async function flush(){
    if(refreshRunning) return;
    refreshRunning = true;
    try {
      while(pendingChannels.size){
        const channels = [...pendingChannels];
        pendingChannels = new Set();
        for(const channel of channels){
          try {
            await refreshChannel(channel);
          } catch(error){
            console.warn(`NUBYX Continuity UI refresh failed for ${channel}`, error);
          }
        }
      }
    } finally {
      refreshRunning = false;
    }
  }

  window.addEventListener('nubyx:sync-event', event => {
    const channel = event?.detail?.channel;
    if(channel !== 'apps' && channel !== 'files') return;
    pendingChannels.add(channel);
    queueMicrotask(() => flush());
  });

  window.addEventListener('nubyx:sync-queued', event => {
    if(!event?.detail?.deduplicated) pendingOutbox += 1;
    setQueueUi();
  });

  window.addEventListener('nubyx:sync-flushed', event => {
    pendingOutbox = Math.max(0, pendingOutbox - (Number(event?.detail?.count) || 0));
    setQueueUi();
  });

  window.addEventListener('nubyx:sync-queue-purged', event => {
    pendingOutbox = Math.max(0, pendingOutbox - (Number(event?.detail?.count) || pendingOutbox));
    setQueueUi();
  });

  window.addEventListener('nubyx:sync-retry-scheduled', event => {
    if(!pendingOutbox) return;
    const seconds = Math.max(1, Math.round((Number(event?.detail?.delay) || 0) / 1000));
    const detailEl = document.querySelector('#syncDetail');
    if(detailEl) detailEl.textContent = `reenvio automático em ${seconds}s · ${pendingOutbox} pendente${pendingOutbox === 1 ? '' : 's'}`;
  });

  window.addEventListener('online', setQueueUi);
  window.addEventListener('offline', setQueueUi);
  window.addEventListener('nubyx:session-ended', () => {
    pendingOutbox = 0;
  });
})();
