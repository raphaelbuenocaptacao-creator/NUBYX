(() => {
  if (!('serviceWorker' in navigator)) return;

  const secureContext = window.isSecureContext || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if (!secureContext) return;

  const UPDATE_COOLDOWN_MS = 60_000;
  const WORKER_PATH = './sw.js';
  const WORKER_SCOPE = './';
  const EXPECTED_WORKER_URL = new URL(WORKER_PATH, document.baseURI);
  const EXPECTED_SCOPE_URL = new URL(WORKER_SCOPE, document.baseURI);
  let registrationRef = null;
  let registrationPromise = null;
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

  function isNubyxRegistration(registration) {
    const worker = registration?.installing || registration?.waiting || registration?.active;
    if (!worker?.scriptURL || !registration?.scope) return false;
    try {
      const scriptUrl = new URL(worker.scriptURL);
      const scopeUrl = new URL(registration.scope);
      return scriptUrl.origin === EXPECTED_WORKER_URL.origin
        && scriptUrl.pathname === EXPECTED_WORKER_URL.pathname
        && scopeUrl.origin === EXPECTED_SCOPE_URL.origin
        && scopeUrl.pathname === EXPECTED_SCOPE_URL.pathname;
    } catch {
      return false;
    }
  }

  async function registerNubyxWorker() {
    if (registrationPromise) return registrationPromise;

    registrationPromise = (async () => {
      try {
        const existing = await navigator.serviceWorker.getRegistration(WORKER_SCOPE);
        const registration = existing && isNubyxRegistration(existing)
          ? existing
          : await navigator.serviceWorker.register(WORKER_PATH, {
              scope: WORKER_SCOPE,
              updateViaCache: 'none'
            });

        registrationRef = registration;
        await updateRegistration({ force: true });
        return registration;
      } catch (error) {
        console.warn('NUBYX service worker registration failed', error);
        return null;
      } finally {
        registrationPromise = null;
      }
    })();

    return registrationPromise;
  }

  function refreshRegistration() {
    if (document.visibilityState !== 'visible') return;
    void updateRegistration();
  }

  window.addEventListener('load', registerNubyxWorker, { once: true });
  window.addEventListener('online', refreshRegistration);
  document.addEventListener('visibilitychange', refreshRegistration);
})();
