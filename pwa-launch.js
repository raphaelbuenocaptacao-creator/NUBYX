(() => {
  const ALLOWED_MODULES = new Set(['home', 'drive', 'store', 'ai']);
  const params = new URLSearchParams(window.location.search);
  const requested = String(params.get('open') || '').toLowerCase().trim();

  function clearDeepLink() {
    const url = new URL(window.location.href);
    url.searchParams.delete('open');
    history.replaceState(history.state, '', url.pathname + url.search + url.hash);
  }

  // The PWA manifest only exposes a small, fixed set of internal destinations.
  // Strip malformed or unknown launch targets instead of leaving untrusted state
  // in the address bar for the rest of the session.
  if (!requested) return;
  if (!ALLOWED_MODULES.has(requested)) {
    clearDeepLink();
    return;
  }

  let opened = false;

  function findTrigger() {
    const controls = Array.from(document.querySelectorAll('[data-open]'));
    return controls.find((control) => control.dataset.open === requested) || null;
  }

  function tryOpen() {
    if (opened) return true;
    const os = document.querySelector('#os');
    if (!os || os.classList.contains('hidden')) return false;

    if (typeof window.openModule === 'function') {
      opened = true;
      window.openModule(requested);
    } else {
      const trigger = findTrigger();
      if (!trigger) return false;
      opened = true;
      trigger.click();
    }

    if (requested === 'ai' && window.NUBYX_AI && window.NUBYX_AI.render) window.NUBYX_AI.render();
    clearDeepLink();
    return true;
  }

  if (tryOpen()) return;

  const observer = new MutationObserver(() => {
    if (tryOpen()) observer.disconnect();
  });
  const os = document.querySelector('#os');
  if (os) observer.observe(os, { attributes: true, attributeFilter: ['class'] });
  window.addEventListener('load', () => {
    if (tryOpen()) observer.disconnect();
  }, { once: true });
})();
