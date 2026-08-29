(() => {
  const ALLOWED_MODULES = new Set(['home', 'drive', 'store', 'ai']);
  const params = new URLSearchParams(window.location.search);
  const requested = String(params.get('open') || '').toLowerCase().trim();

  if (!ALLOWED_MODULES.has(requested)) return;

  let opened = false;

  function clearDeepLink() {
    const url = new URL(window.location.href);
    url.searchParams.delete('open');
    history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  }

  function tryOpen() {
    if (opened) return true;
    const os = document.querySelector('#os');
    if (!os || os.classList.contains('hidden') || typeof window.openModule !== 'function') return false;

    opened = true;
    window.openModule(requested);
    if (requested === 'ai' && window.NUBYX_AI?.render) window.NUBYX_AI.render();
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
