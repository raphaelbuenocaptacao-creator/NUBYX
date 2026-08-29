(() => {
  let refreshRunning = false;
  let pendingChannels = new Set();

  function activeSurface(){
    return document.querySelector('#panel .eyebrow')?.textContent?.trim() || '';
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
})();
