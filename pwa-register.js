(() => {
  if (!('serviceWorker' in navigator)) return;

  const secureContext = window.isSecureContext || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if (!secureContext) return;

  let registrationRef = null;

  async function registerNubyxWorker() {
    try {
      const registration = await navigator.serviceWorker.register('./sw.js', {
        scope: './',
        updateViaCache: 'none'
      });
      registrationRef = registration;
      await registration.update().catch(() => {});
      return registration;
    } catch (error) {
      console.warn('NUBYX service worker registration failed', error);
      return null;
    }
  }

  function refreshRegistration() {
    if (document.visibilityState !== 'visible') return;
    registrationRef?.update().catch(() => {});
  }

  window.addEventListener('load', registerNubyxWorker, { once: true });
  window.addEventListener('online', refreshRegistration);
  document.addEventListener('visibilitychange', refreshRegistration);
})();
