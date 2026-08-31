(() => {
  if (!('serviceWorker' in navigator)) return;

  const hadControllerAtBoot = Boolean(navigator.serviceWorker.controller);
  let reloading = false;
  let updatePrompt = null;

  function removePrompt() {
    if (!updatePrompt) return;
    updatePrompt.remove();
    updatePrompt = null;
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
    copy.innerHTML = '<strong style="display:block;font-size:15px;margin-bottom:3px">Nova versão do NUBYX pronta</strong><span style="opacity:.72">Atualize quando for seguro. Seu trabalho atual não será interrompido.</span>';

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
    update.addEventListener('click', () => {
      update.disabled = true;
      update.textContent = 'Atualizando…';
      worker.postMessage({ type: 'NUBYX_SKIP_WAITING' });
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
