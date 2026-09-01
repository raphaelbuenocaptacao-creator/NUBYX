(() => {
  if (!('serviceWorker' in navigator)) return;

  const secureContext = window.isSecureContext || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if (!secureContext) return;

  const UPDATE_COOLDOWN_MS = 60_000;
  let registrationRef = null;
  let updatePromise = null;
  let lastUpdateStartedAt = 0;

  function updateRegistration({ force = false } = {}) {
    if (!registrationRef) return Promise.resolve(null);
    if (updatePromise) return updatePromise;

    const now = Date.now();
    if (!force && now - lastUpdateStartedAt < UPDATE_COOLDOWN_MS) return Promise.resolve(registrationRef);

    lastUpdateStartedAt = now;
    updatePromise = registrationRef.update()
      .catch((error) => {
        console.warn('NUBYX service worker update check failed', error);
        return null;
      })
      .finally(() => {
        updatePromise = null;
      });

    return updatePromise;
  }

  async function registerNubyxWorker() {
    try {
      const registration = await navigator.serviceWorker.register('./sw.js', {
        scope: './',
        updateViaCache: 'none'
      });
      registrationRef = registration;
      await updateRegistration({ force: true });
      return registration;
    } catch (error) {
      console.warn('NUBYX service worker registration failed', error);
      return null;
    }
  }

  function refreshRegistration() {
    if (document.visibilityState !== 'visible') return;
    void updateRegistration();
  }

  window.addEventListener('load', registerNubyxWorker, { once: true });
  window.addEventListener('online', refreshRegistration);
  document.addEventListener('visibilitychange', refreshRegistration);
})();
